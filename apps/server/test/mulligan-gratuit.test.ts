/**
 * Mulligan gratuit : au choix de la table, autant de fois qu'elle veut.
 *
 * Le premier mulligan gratuit du Commander n'est pas imposé (des tables ne le
 * jouent pas). Il se demande, mulligan par mulligan : la main repart, sept
 * cartes reviennent, et le compte des cartes à remettre dessous ne bouge pas.
 */
import { describe, expect, it } from 'vitest';
import { getZone } from '../src/game/state.js';
import { twoSeatTable } from './fixture.js';

describe('mulligan gratuit', () => {
  it('repioche sept cartes sans rien ajouter à remettre dessous', async () => {
    const { room, a } = twoSeatTable();
    room.startGame('seat_0');
    await room.handleIntent(a, 'm1', { type: 'MULLIGAN', free: true });
    await room.handleIntent(a, 'm2', { type: 'MULLIGAN', free: true });
    expect(getZone(room.state, { seat: 'seat_0', kind: 'HAND' })).toHaveLength(7);
    expect(room.state.seats.get('seat_0')!.playerCounters.get('mulligans')).toBeUndefined();
    expect(room.state.log.at(-1)?.text).toMatch(/mulligan gratuit — aucune carte à remettre dessous/);
  });

  it('un payant compte une carte, un gratuit ensuite la laisse due', async () => {
    const { room, a } = twoSeatTable();
    room.startGame('seat_0');
    await room.handleIntent(a, 'm1', { type: 'MULLIGAN' });
    expect(room.state.log.at(-1)?.text).toMatch(/mulligan \(1\) — 1 carte\(s\) à remettre dessous/);
    await room.handleIntent(a, 'm2', { type: 'MULLIGAN', free: true });
    expect(room.state.seats.get('seat_0')!.playerCounters.get('mulligans')).toBe(1);
    expect(room.state.log.at(-1)?.text).toMatch(/mulligan gratuit — 1 carte\(s\) à remettre dessous/);
  });
});
