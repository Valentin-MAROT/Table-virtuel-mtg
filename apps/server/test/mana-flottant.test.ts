/**
 * La réserve de mana flottant, côté serveur.
 *
 * Elle n'a pas d'intent à elle : elle voyage par `SET_PLAYER_COUNTER`, sous des
 * `kind` préfixés `mana:`. Ce raccourci est délibéré — un intent neuf coûterait
 * une montée de `PROTOCOL_VERSION`, donc la déconnexion de toutes les tables
 * ouvertes — mais il n'est tenable qu'à une condition, et c'est elle que ces
 * tests gardent : **le journal se tait pour ce préfixe, et pour lui seul**.
 *
 * Sans cette condition, alimenter une réserve avec cinq terrains puis la vider
 * écrirait une dizaine de lignes par tour, pour une information qui ne survit
 * pas à l'étape en cours — et qui pousserait hors du journal ce qu'on y cherche
 * vraiment.
 */
import { describe, expect, it } from 'vitest';
import { isManaCounter, manaCounterKind, MANA_POOL_SYMBOLS } from '@mtg/shared';
import { twoSeatTable } from './fixture.js';
import { auditInvariants } from './invariants.js';

describe('réserve de mana', () => {
  it('se pose et se retient, sans écrire une ligne de journal', async () => {
    const { room, a } = twoSeatTable();
    const avant = room.state.log.length;

    for (let n = 1; n <= 5; n++) {
      await room.handleIntent(a, `mana-${n}`, {
        type: 'SET_PLAYER_COUNTER',
        seat: 'seat_0',
        kind: manaCounterKind('G'),
        value: n,
      });
    }

    expect(room.state.seats.get('seat_0')!.playerCounters.get('mana:G')).toBe(5);
    // Cinq terrains engagés, zéro ligne : c'est tout l'objet de la garde.
    expect(room.state.log.length).toBe(avant);
    auditInvariants(room.state);
  });

  it('reste diffusée à toute la table : se taire n’est pas cacher', async () => {
    const { room, a, b } = twoSeatTable();
    b.received.length = 0;

    await room.handleIntent(a, 'mana', {
      type: 'SET_PLAYER_COUNTER',
      seat: 'seat_0',
      kind: manaCounterKind('U'),
      value: 2,
    });

    /*
     * L'adversaire reçoit l'event. C'est le point : une réserve de mana dit si
     * un joueur peut répondre, et la masquer changerait le jeu. Ce qui
     * disparaît est la ligne de récit, jamais le fait.
     */
    const vu = b.received.find(
      (m) =>
        (m as { t: string; event?: { type: string; kind?: string; value?: number } }).t === 'event' &&
        (m as { event?: { type: string } }).event?.type === 'PLAYER_COUNTER_CHANGED',
    ) as { event: { kind: string; value: number; seat: string } } | undefined;
    expect(vu?.event).toMatchObject({ seat: 'seat_0', kind: 'mana:U', value: 2 });
  });

  it('disparaît à zéro, comme tout compteur de joueur', async () => {
    const { room, a } = twoSeatTable();
    await room.handleIntent(a, 'pose', {
      type: 'SET_PLAYER_COUNTER',
      seat: 'seat_0',
      kind: manaCounterKind('R'),
      value: 3,
    });
    await room.handleIntent(a, 'vide', {
      type: 'SET_PLAYER_COUNTER',
      seat: 'seat_0',
      kind: manaCounterKind('R'),
      value: 0,
    });
    expect(room.state.seats.get('seat_0')!.playerCounters.has('mana:R')).toBe(false);
  });

  it('ne fait pas taire les compteurs ordinaires', async () => {
    const { room, a } = twoSeatTable();
    const avant = room.state.log.length;

    await room.handleIntent(a, 'poison', {
      type: 'SET_PLAYER_COUNTER',
      seat: 'seat_0',
      kind: 'poison',
      value: 3,
    });
    expect(room.state.log.length).toBe(avant + 1);
    expect(room.state.log.at(-1)!.text).toContain('poison = 3');

    /*
     * Et un `mana:` **non reconnu** est un compteur ordinaire : le dialogue des
     * compteurs de joueur accepte un nom libre, et quelqu'un peut taper
     * « mana:rouge ». La garde porte sur la liste des six symboles, pas sur le
     * seul préfixe — sans quoi il suffirait d'un nom bien choisi pour écrire en
     * silence dans l'état d'un siège.
     */
    await room.handleIntent(a, 'faux', {
      type: 'SET_PLAYER_COUNTER',
      seat: 'seat_0',
      kind: 'mana:rouge',
      value: 1,
    });
    expect(room.state.log.at(-1)!.text).toContain('mana:rouge = 1');
  });
});

describe('les symboles reconnus', () => {
  it('sont les six de la table, et rien d’autre', () => {
    expect([...MANA_POOL_SYMBOLS]).toEqual(['W', 'U', 'B', 'R', 'G', 'C']);
    for (const symbol of MANA_POOL_SYMBOLS) {
      expect(isManaCounter(manaCounterKind(symbol))).toBe(true);
    }
    for (const faux of ['mana:rouge', 'mana:', 'mana:w', 'poison', 'commander_tax:01', 'W']) {
      expect(isManaCounter(faux), faux).toBe(false);
    }
  });
});
