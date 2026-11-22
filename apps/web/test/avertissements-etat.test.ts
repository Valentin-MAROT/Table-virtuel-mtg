/**
 * Avertissements d'état : signaler ce que les règles feraient, sans rien faire.
 *
 * Le test garde les cas qui doivent parler et, autant, ceux qui doivent se
 * taire — une alerte permanente est une alerte qu'on ne lit plus.
 */
import { describe, expect, it } from 'vitest';
import type { CardView, SeatSummary } from '@mtg/shared';
import { currentToughness, stateWarnings } from '../src/lib/stateWarnings.js';

function seat(id: string, extra: Partial<SeatSummary> = {}): SeatSummary {
  return {
    id, seatIndex: 0, displayName: id, userId: null, connected: true, conceded: false, life: 40,
    handCount: 7, playerCounters: [], commanderDamage: {}, commanderTax: {}, playmatUrl: null,
    cardBackUrl: null, color: '#fff', deckName: null, ...extra,
  };
}

function card(id: string, sid: string, counters: CardView['counters'] = [], controller = 'a'): CardView {
  return {
    id, kind: 'CARD', owner: controller, controller, zone: { seat: controller, kind: 'BATTLEFIELD' },
    tapped: false, x: 0, y: 0, rotation: 0, counters, sortIndex: 0, faceDown: false, scryfallId: sid,
    flipped: false, isFoil: false,
  } as CardView;
}

const META: Record<string, { name: string; typeLine: string; toughness?: string }> = {
  bears: { name: 'Grizzly Bears', typeLine: 'Creature — Bear', toughness: '2' },
  selenia: { name: 'Selenia', typeLine: 'Legendary Creature — Angel', toughness: '3' },
  land: { name: 'Plains', typeLine: 'Basic Land — Plains' },
};
const metaOf = (sid: string) => META[sid];

describe('avertissements d’état', () => {
  it('une table saine ne dit rien', () => {
    expect(stateWarnings([seat('a'), seat('b')], [card('1', 'bears'), card('2', 'land')], metaOf)).toEqual([]);
  });

  it('endurance tombée à 0 par des marqueurs −1/−1 : signalée, cimetière proposé', () => {
    const w = stateWarnings([seat('a')], [card('1', 'bears', [{ kind: '-1/-1', value: 2 }])], metaOf);
    expect(w).toHaveLength(1);
    expect(w[0]!.suggest).toBe('GRAVEYARD');
    expect(w[0]!.text).toMatch(/0 d'endurance/);
  });

  it('les +1/+1 et −1/−1 se compensent', () => {
    const c = card('1', 'bears', [{ kind: '-1/-1', value: 3 }, { kind: '+1/+1', value: 2 }]);
    expect(currentToughness(c, META['bears'])).toBe(1);
  });

  it('règle de la légende, par contrôleur', () => {
    const w = stateWarnings([seat('a'), seat('b')], [card('1', 'selenia'), card('2', 'selenia'), card('3', 'selenia', [], 'b')], metaOf);
    expect(w).toHaveLength(1);
    expect(w[0]!.cardIds).toEqual(['1', '2']);
  });

  it('vie, poison et dégâts de commandant', () => {
    const w = stateWarnings(
      [
        seat('a', { life: 0 }),
        seat('b', { playerCounters: [{ kind: 'poison', value: 10 }] }),
        seat('c', { commanderDamage: { a: { cmd1: 21 } } }),
        seat('d', { life: -3, conceded: true }),
      ],
      [],
      metaOf,
    );
    expect(w.map((x) => x.id)).toEqual(['life:a', 'poison:b', 'cmd:c:cmd1']);
  });
});
