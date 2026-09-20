/**
 * Client WebSocket.
 *
 * Reconnexion automatique avec repli exponentiel, resynchronisation par `seq`,
 * et détection des trous de séquence sans attendre la coupure du socket.
 */
import { ulid } from 'ulid';
import { LIMITS, PROTOCOL_VERSION, type Intent, type ServerMessage, type Seq } from '@mtg/shared';

export type SocketStatus = 'connecting' | 'open' | 'closed' | 'fatal';

export interface SocketHandlers {
  onMessage: (message: ServerMessage) => void;
  onStatus: (status: SocketStatus, detail?: string) => void;
  /** Dernier `seq` appliqué, demandé au moment de (re)dire bonjour. */
  currentSeq: () => Seq;
}

const SEAT_TOKEN_PREFIX = 'mtg.seatToken.';

/**
 * A-t-on une place à reprendre à cette table ?
 *
 * La page de table doit le savoir **avant** que le socket soit ouvert : sinon
 * elle affiche le salon — « choisissez un nom et un deck » — à quelqu'un qui a
 * déjà un siège, une main et un terrain. Le temps que la reprise aboutisse,
 * on lui demande de s'inscrire à une table où il est déjà assis.
 */
export function hasSeatToken(code: string): boolean {
  try {
    return localStorage.getItem(SEAT_TOKEN_PREFIX + code) !== null;
  } catch {
    // Stockage refusé (navigation privée) : on ne sait pas, donc on ne promet rien.
    return false;
  }
}

export class GameSocket {
  private ws: WebSocket | null = null;
  private retry = 0;
  private closedByUs = false;
  private pingTimer: number | null = null;
  /**
   * Les pings restés sans réponse.
   *
   * Le serveur, lui, tient déjà ce compte de son côté (`ws/server.ts`) et
   * ferme un client muet. L'inverse n'existait pas : le client envoyait un
   * `ping` toutes les quinze secondes sans jamais regarder s'il revenait
   * quelque chose. Or une coupure n'est pas toujours une fermeture — un
   * portable qui se met en veille, un NAT qui oublie sa translation, un
   * changement de réseau laissent une connexion **à moitié ouverte** : le
   * `readyState` reste `OPEN`, `onclose` ne part jamais, et rien ne circule
   * plus. La table paraît vivante, alors que chaque intent tombe dans le vide
   * et qu'aucun bandeau de reconnexion ne s'allume.
   */
  private missedPongs = 0;

  constructor(
    private readonly code: string,
    private readonly handlers: SocketHandlers,
  ) {}

  get seatToken(): string | null {
    return localStorage.getItem(SEAT_TOKEN_PREFIX + this.code);
  }

  set seatToken(token: string | null) {
    if (token) localStorage.setItem(SEAT_TOKEN_PREFIX + this.code, token);
    else localStorage.removeItem(SEAT_TOKEN_PREFIX + this.code);
  }

  connect(): void {
    this.closedByUs = false;
    this.handlers.onStatus('connecting');

    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${scheme}://${location.host}/ws/rooms/${this.code}`);
    this.ws = ws;

    ws.onopen = () => {
      this.retry = 0;
      this.missedPongs = 0;
      this.handlers.onStatus('open');
      const sinceSeq = this.handlers.currentSeq();
      this.raw({
        t: 'hello',
        protocol: PROTOCOL_VERSION,
        ...(this.seatToken ? { seatToken: this.seatToken } : {}),
        ...(sinceSeq > 0 ? { sinceSeq } : {}),
      });

      // Le même budget que celui du serveur : trois sondes sans le moindre
      // signe de vie, et l'on considère le lien mort plutôt que de l'attendre.
      this.pingTimer = window.setInterval(() => {
        if (this.missedPongs >= LIMITS.missedPongsBeforeClose) {
          this.giveUp('connexion perdue');
          return;
        }
        this.missedPongs += 1;
        this.raw({ t: 'ping', ts: Date.now() });
      }, LIMITS.pingIntervalMs);
    };

    ws.onmessage = (event) => {
      // N'importe quel octet reçu prouve que le lien est vivant, `pong` compris
      // — et c'est volontairement plus large que le seul `pong` : une table
      // active nous parle bien assez pour n'avoir jamais à être sondée. On
      // remet le compteur avant même de lire la trame : une trame illisible
      // reste la preuve qu'il y a quelqu'un au bout.
      this.missedPongs = 0;
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }
      if (message.t === 'hello' && message.seatToken) this.seatToken = message.seatToken;
      if (message.t === 'error' && message.fatal) {
        this.closedByUs = true;
        this.handlers.onStatus('fatal', message.message);
      }
      this.handlers.onMessage(message);
    };

    ws.onclose = () => {
      this.stopPing();
      if (this.closedByUs) return;

      this.handlers.onStatus('closed');
      this.reconnectLater();
    };
  }

  /**
   * Le lien est mort sans que le socket ait eu l'obligeance de le dire.
   *
   * On le déclare nous-mêmes, et on repart par le chemin de reconnexion
   * ordinaire : c'est la seule façon pour le joueur de voir « reconnexion »
   * au lieu d'une table figée qui avale ses gestes.
   */
  private giveUp(reason: string): void {
    const dead = this.ws;
    if (!dead) return;
    this.ws = null;
    /*
     * Les gestionnaires sont détachés **avant** la fermeture. Un `onclose`
     * tardif — le navigateur finit par en émettre un — programmerait sinon une
     * seconde reconnexion par-dessus la nôtre, et deux sockets ouverts sur la
     * même table, c'est deux `hello` et un siège repris à soi-même.
     */
    dead.onopen = null;
    dead.onmessage = null;
    dead.onclose = null;
    dead.onerror = null;
    try {
      dead.close();
    } catch {
      // Déjà mort : il n'y a rien à fermer, et c'est exactement le cas visé.
    }
    this.stopPing();
    this.handlers.onStatus('closed', reason);
    this.reconnectLater();
  }

  private stopPing(): void {
    if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private reconnectLater(): void {
    // Repli exponentiel plafonné : on ne martèle pas un serveur qui redémarre.
    const delay = Math.min(15_000, 500 * 2 ** this.retry++);
    window.setTimeout(() => this.connect(), delay);
  }

  /** Demande explicite de rattrapage, sur détection d'un trou de séquence. */
  resync(sinceSeq: Seq): void {
    this.raw({ t: 'resync', sinceSeq });
  }

  send(intent: Intent): string {
    const cid = ulid();
    this.raw({ t: 'intent', cid, ackSeq: this.handlers.currentSeq(), intent });
    return cid;
  }

  close(): void {
    this.closedByUs = true;
    this.ws?.close();
  }

  private raw(message: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }
}
