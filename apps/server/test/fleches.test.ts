/**
 * Flèches : cibler, attaquer, bloquer (`src/game/arrows.ts`).
 *
 * Déclaratives (§1.1) : elles ne touchent à aucune carte. Ce qui doit rester
 * vrai : on n'en trace qu'à partir de ses propres cartes sur la table ; une
 * attaque ou un blocage remplace le précédent de la même carte ; elles
 * meurent avec leur extrémité et au passage du tour ; et le journal ne nomme
 * jamais une carte que la table n'a pas le droit de lire.
 */
import { describe, expect, it } from 'vitest';
import type { ServerMessage } from '@mtg/shared';
import { getZone } from '../src/game/state.js';
import { twoSeatTable, type Table } from './fixture.js';

async function deuxPermanents(t: Table): Promise<{ mien: string; sien: string }> {
  t.room.startGame('seat_0');
  const mien = getZone(t.room.state, { seat: 'seat_0', kind: 'HAND' })[0]!;
  const sien = getZone(t.room.state, { seat: 'seat_1', kind: 'HAND' })[0]!;
  await t.room.handleIntent(t.a, 'p1', { type: 'MOVE_CARD', cardId: mien, to: { seat: 'seat_0', kind: 'BATTLEFIELD' }, x: 10, y: 10 });
  await t.room.handleIntent(t.b, 'p2', { type: 'MOVE_CARD', cardId: sien, to: { seat: 'seat_1', kind: 'BATTLEFIELD' }, x: 10, y: 10 });
  return { mien, sien };
}

const rejet = (m: ServerMessage[]): string | undefined => {
  const last = m.at(-1);
  return last?.t === 'reject' ? last.code : undefined;
};

describe('flèches', () => {
  it('une attaque se trace vers un joueur et se lit au journal', async () => {
    const t = twoSeatTable();
    const { mien } = await deuxPermanents(t);
    await t.room.handleIntent(t.a, 'f1', { type: 'ADD_ARROWS', kind: 'ATTACK', from: [mien], to: { seat: 'seat_1' } });
    const arrows = [...t.room.state.arrows.values()];
    expect(arrows).toHaveLength(1);
    expect(arrows[0]).toMatchObject({ seat: 'seat_0', kind: 'ATTACK', from: mien, to: { seat: 'seat_1' } });
    expect(t.room.state.log.at(-1)?.text).toMatch(/^Alice attaque Bob avec Carte \d+$/);
    // Bob la reçoit, et la retrouverait dans un instantané.
    expect(t.b.received.some((m) => m.t === 'event' && m.event.type === 'ARROWS_ADDED')).toBe(true);
    expect(t.room.snapshotFor('seat_1').arrows).toHaveLength(1);
  });

  it('on ne trace pas depuis la carte d’un autre', async () => {
    const t = twoSeatTable();
    const { sien } = await deuxPermanents(t);
    await t.room.handleIntent(t.a, 'f1', { type: 'ADD_ARROWS', kind: 'TARGET', from: [sien], to: { seat: 'seat_1' } });
    expect(rejet(t.a.received)).toBe('ERR_NOT_YOURS');
    expect(t.room.state.arrows.size).toBe(0);
  });

  it('on ne trace pas depuis la main', async () => {
    const t = twoSeatTable();
    await deuxPermanents(t);
    const enMain = getZone(t.room.state, { seat: 'seat_0', kind: 'HAND' })[0]!;
    await t.room.handleIntent(t.a, 'f1', { type: 'ADD_ARROWS', kind: 'TARGET', from: [enMain], to: { seat: 'seat_1' } });
    expect(rejet(t.a.received)).toBe('ERR_BAD_ZONE');
  });

  it('un blocage vise une créature, et remplace le blocage précédent', async () => {
    const t = twoSeatTable();
    const { mien, sien } = await deuxPermanents(t);
    await t.room.handleIntent(t.b, 'b0', { type: 'ADD_ARROWS', kind: 'BLOCK', from: [sien], to: { seat: 'seat_0' } });
    expect(rejet(t.b.received)).toBe('ERR_PAYLOAD');
    await t.room.handleIntent(t.b, 'b1', { type: 'ADD_ARROWS', kind: 'BLOCK', from: [sien], to: { card: mien } });
    await t.room.handleIntent(t.b, 'b2', { type: 'ADD_ARROWS', kind: 'BLOCK', from: [sien], to: { card: mien } });
    expect([...t.room.state.arrows.values()].filter((a) => a.kind === 'BLOCK')).toHaveLength(1);
    expect(t.room.state.log.at(-1)?.text).toMatch(/^Bob bloque Carte \d+ avec Carte \d+ Bob$/);
  });

  it('une flèche meurt avec la carte qui quitte le champ', async () => {
    const t = twoSeatTable();
    const { mien } = await deuxPermanents(t);
    await t.room.handleIntent(t.a, 'f1', { type: 'ADD_ARROWS', kind: 'ATTACK', from: [mien], to: { seat: 'seat_1' } });
    await t.room.handleIntent(t.a, 'mv', { type: 'MOVE_CARD', cardId: mien, to: { seat: 'seat_0', kind: 'GRAVEYARD' } });
    expect(t.room.state.arrows.size).toBe(0);
    expect(t.b.received.some((m) => m.t === 'event' && m.event.type === 'ARROWS_REMOVED')).toBe(true);
  });

  it('toutes les flèches s’effacent au passage du tour', async () => {
    const t = twoSeatTable();
    const { mien, sien } = await deuxPermanents(t);
    await t.room.handleIntent(t.a, 'f1', { type: 'ADD_ARROWS', kind: 'ATTACK', from: [mien], to: { seat: 'seat_1' } });
    await t.room.handleIntent(t.b, 'f2', { type: 'ADD_ARROWS', kind: 'BLOCK', from: [sien], to: { card: mien } });
    expect(t.room.state.arrows.size).toBe(2);
    await t.room.handleIntent(t.a, 'end', { type: 'END_TURN' });
    expect(t.room.state.arrows.size).toBe(0);
  });

  it('retirer ses flèches ne touche pas à celles des autres', async () => {
    const t = twoSeatTable();
    const { mien, sien } = await deuxPermanents(t);
    await t.room.handleIntent(t.a, 'f1', { type: 'ADD_ARROWS', kind: 'TARGET', from: [mien], to: { card: sien } });
    await t.room.handleIntent(t.b, 'f2', { type: 'ADD_ARROWS', kind: 'TARGET', from: [sien], to: { card: mien } });
    await t.room.handleIntent(t.a, 'c', { type: 'CLEAR_ARROWS' });
    expect([...t.room.state.arrows.values()].map((a) => a.seat)).toEqual(['seat_1']);
  });

  it('une cible face cachée n’est pas nommée', async () => {
    const t = twoSeatTable();
    t.room.startGame('seat_0');
    const mien = getZone(t.room.state, { seat: 'seat_0', kind: 'HAND' })[0]!;
    const cachee = getZone(t.room.state, { seat: 'seat_1', kind: 'HAND' })[0]!;
    await t.room.handleIntent(t.a, 'p1', { type: 'MOVE_CARD', cardId: mien, to: { seat: 'seat_0', kind: 'BATTLEFIELD' }, x: 10, y: 10 });
    await t.room.handleIntent(t.b, 'p2', { type: 'MOVE_CARD', cardId: cachee, to: { seat: 'seat_1', kind: 'BATTLEFIELD' }, x: 10, y: 10, faceDown: true });
    await t.room.handleIntent(t.a, 'f1', { type: 'ADD_ARROWS', kind: 'TARGET', from: [mien], to: { card: cachee } });
    const line = t.room.state.log.at(-1)!;
    expect(line.text).toMatch(/^Alice cible une carte avec Carte \d+$/);
    expect(line.text).not.toContain('Bob');
  });
});
