/**
 * Le chien de garde du socket client.
 *
 * Le serveur tient déjà ce compte de son côté et ferme un client muet. Le
 * client, lui, envoyait un `ping` toutes les quinze secondes sans jamais
 * regarder s'il revenait quelque chose — or une coupure n'est pas toujours une
 * fermeture. Une veille, un NAT qui oublie sa translation, un changement de
 * réseau laissent la connexion **à moitié ouverte** : `readyState` reste
 * `OPEN`, `onclose` ne part jamais. C'est le cas que ces tests fabriquent, et
 * il n'est pas théorique : c'est celui du portable qu'on rouvre.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIMITS } from '@mtg/shared';

/** Un socket qui accepte tout et ne répond jamais, sauf si on le lui dit. */
class FakeSocket {
  static last: FakeSocket | null = null;
  static opened = 0;
  readyState = 1;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeSocket.last = this;
    FakeSocket.opened += 1;
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.readyState = 3;
  }

  /** Le serveur répond : c'est ce qui doit remettre le compteur à zéro. */
  deliver(payload: unknown): void {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

const store = new Map<string, string>();
vi.stubGlobal('WebSocket', FakeSocket as unknown as typeof WebSocket);
vi.stubGlobal('location', { protocol: 'https:', host: 'exemple.test' });
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});
vi.stubGlobal('window', {
  setInterval: (fn: () => void, ms?: number) => setInterval(fn, ms) as unknown as number,
  clearInterval: (id: number) => clearInterval(id as unknown as NodeJS.Timeout),
  setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms) as unknown as number,
});

const { GameSocket } = await import('../src/net/socket.js');

const TICK = LIMITS.pingIntervalMs;
const BUDGET = LIMITS.missedPongsBeforeClose;

/**
 * Les sockets ouverts par un test, fermés à sa sortie.
 *
 * Sans cela, la minuterie de sonde d'un test survit au suivant : le chien de
 * garde d'une table oubliée se déclenche pendant l'avance du temps d'un autre
 * test et rouvre un socket, qui vient fausser le compte. C'est le défaut que
 * ces tests cherchent, retourné contre eux.
 */
const live: Array<{ close: () => void }> = [];

function connected(): { statuses: Array<[string, string | undefined]>; socket: FakeSocket } {
  const statuses: Array<[string, string | undefined]> = [];
  const game = new GameSocket('ABCDEF', {
    onMessage: () => undefined,
    onStatus: (s, detail) => void statuses.push([s, detail]),
    currentSeq: () => 0,
  });
  live.push(game);
  game.connect();
  const socket = FakeSocket.last!;
  socket.onopen?.();
  return { statuses, socket };
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.last = null;
  FakeSocket.opened = 0;
  store.clear();
});

afterEach(() => {
  for (const game of live.splice(0)) game.close();
  vi.useRealTimers();
});

describe('silence du serveur', () => {
  it('déclare la connexion perdue et repart, socket jamais fermé par le réseau', () => {
    const { statuses, socket } = connected();
    expect(statuses.at(-1)?.[0]).toBe('open');

    // Le socket reste OPEN et `onclose` ne part pas : c'est toute la difficulté.
    vi.advanceTimersByTime(TICK * (BUDGET + 1));

    expect(socket.closed).toBe(true);
    expect(statuses.at(-1)).toEqual(['closed', 'connexion perdue']);

    // Et le joueur est effectivement remis en route, pas laissé en plan.
    vi.advanceTimersByTime(1_000);
    expect(FakeSocket.opened).toBe(2);
  });

  it('un `pong` suffit à tenir le lien ouvert indéfiniment', () => {
    const { statuses, socket } = connected();

    for (let i = 0; i < BUDGET * 10; i++) {
      vi.advanceTimersByTime(TICK);
      socket.deliver({ t: 'pong', ts: Date.now(), serverTs: Date.now() });
    }

    expect(socket.closed).toBe(false);
    expect(statuses.at(-1)?.[0]).toBe('open');
    expect(FakeSocket.opened).toBe(1);
  });

  it('une table qui parle n’a jamais besoin d’être sondée', () => {
    const { socket } = connected();

    // Aucun `pong`, mais des events : la preuve de vie est la même.
    for (let i = 0; i < BUDGET * 10; i++) {
      vi.advanceTimersByTime(TICK);
      socket.deliver({ t: 'event', seq: i + 1, event: { type: 'CARD_HIDDEN', cardId: 'x' } });
    }

    expect(socket.closed).toBe(false);
  });

  it('ne programme qu’une seule reconnexion, même si `onclose` arrive en retard', () => {
    const { socket } = connected();
    vi.advanceTimersByTime(TICK * (BUDGET + 1));

    /*
     * Le navigateur finit par émettre son `onclose` sur le socket mort — il le
     * dispatche vers la propriété, et elle a été mise à `null` avant la
     * fermeture. Le tardif ne peut donc rien programmer. Sans ce détachement,
     * deux sockets s'ouvraient sur la même table : deux `hello`, et un siège
     * repris à soi-même.
     */
    expect(socket.onclose).toBeNull();
    socket.onclose?.();

    vi.advanceTimersByTime(30_000);
    expect(FakeSocket.opened).toBe(2);
  });
});
