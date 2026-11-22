/**
 * Taxe de commandant : un lancement par mégarde ne doit rien coûter.
 *
 * Mesuré sur les parties réelles (octobre 2026) : un commandant sur quatre
 * sorti de sa zone y revenait dans la foulée, suivi d'une correction de taxe à
 * la main. La taxe reste dérivée du déplacement (§6.6) ; ce qui change, c'est
 * qu'un retour **immédiat** — avant tout autre geste du joueur — la rend, et
 * que Ctrl+Z sur un lancement la rend aussi.
 */
import { describe, expect, it } from 'vitest';
import type { ObjectId } from '@mtg/shared';
import { getZone } from '../src/game/state.js';
import { twoSeatTable } from './fixture.js';

const COMMAND = { seat: 'seat_0', kind: 'COMMAND' } as const;
const FIELD = { seat: 'seat_0', kind: 'BATTLEFIELD' } as const;

async function withCommander() {
  const t = twoSeatTable();
  t.room.startGame('seat_0');
  const id = getZone(t.room.state, { seat: 'seat_0', kind: 'HAND' })[0]! as ObjectId;
  await t.room.handleIntent(t.a, 'c0', { type: 'MOVE_CARD', cardId: id, to: COMMAND });
  const tax = (): number => t.room.state.seats.get('seat_0')!.commanderTax.get(id) ?? 0;
  const cast = (cid: string) => t.room.handleIntent(t.a, cid, { type: 'MOVE_CARD', cardId: id, to: FIELD, x: 100, y: 100 });
  const back = (cid: string) => t.room.handleIntent(t.a, cid, { type: 'MOVE_CARD', cardId: id, to: COMMAND });
  return { ...t, id, tax, cast, back };
}

describe('taxe de commandant et retour immédiat', () => {
  it('rend la taxe quand le commandant revient avant tout autre geste', async () => {
    const t = await withCommander();
    await t.cast('c1');
    expect(t.tax()).toBe(1);
    await t.back('c2');
    expect(t.tax()).toBe(0);
    expect(t.room.state.log.at(-1)?.text).toMatch(/taxe de commandant non comptée/);
  });

  it('garde la taxe si le joueur a fait autre chose entre-temps', async () => {
    const t = await withCommander();
    await t.cast('c1');
    await t.room.handleIntent(t.a, 'd', { type: 'DRAW', count: 1 });
    await t.back('c2');
    expect(t.tax()).toBe(1);
  });

  it("le geste d'un autre joueur ne ferme pas la fenêtre", async () => {
    const t = await withCommander();
    await t.cast('c1');
    await t.room.handleIntent(t.b, 'd', { type: 'DRAW', count: 1 });
    await t.back('c2');
    expect(t.tax()).toBe(0);
  });

  it('Ctrl+Z sur un lancement rend aussi la taxe', async () => {
    const t = await withCommander();
    await t.cast('c1');
    await t.room.handleIntent(t.a, 'u', { type: 'UNDO_LAST' });
    expect(getZone(t.room.state, COMMAND)).toContain(t.id);
    expect(t.tax()).toBe(0);
  });

  it('un second lancement réel compte toujours', async () => {
    const t = await withCommander();
    await t.cast('c1');
    await t.room.handleIntent(t.a, 'tap', { type: 'TAP', cardIds: [t.id] });
    await t.back('c2');
    await t.cast('c3');
    expect(t.tax()).toBe(2);
  });
});
