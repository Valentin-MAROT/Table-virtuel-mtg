/**
 * Indices visuels des gestes adverses (`lib/actionCues.ts`).
 *
 * Ce qui doit rester vrai : une carte qui **arrive** sur le champ brille, mais
 * le rangement de ce qui y est déjà ne fait rien briller — le serveur republie
 * toute la zone (`CARDS_MOVED` d'une zone vers elle-même) quand son ordre
 * change, et chaque carte jouée allumait alors tous les permanents du joueur.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { CardView, Event } from '@mtg/shared';
import { entersBattlefield, noteLiveEvent, resetCues, useCues } from '../src/lib/actionCues.js';

const BF = { seat: 'seat_1', kind: 'BATTLEFIELD' } as const;
const HAND = { seat: 'seat_1', kind: 'HAND' } as const;

function carte(id: string, zone = BF, extra: Partial<CardView> = {}): CardView {
  return {
    id, kind: 'CARD', owner: 'seat_1', controller: 'seat_1', zone, tapped: false, x: 0, y: 0,
    rotation: 0, counters: [], sortIndex: 0, faceDown: false, scryfallId: `sf-${id}`, flipped: false,
    ...extra,
  } as unknown as CardView;
}

const allumees = (): string[] => [...useCues.getState().touched.keys()].sort();

describe('halo des gestes adverses', () => {
  beforeEach(() => resetCues());

  it('une carte jouée depuis la main brille, seule', () => {
    noteLiveEvent({ type: 'CARD_MOVED', card: carte('c3'), from: HAND, to: BF } as Event, 'seat_1', 'seat_0', new Map());
    expect(allumees()).toEqual(['c3']);
  });

  it('la zone republiée dans son nouvel ordre ne fait rien briller', () => {
    const zone = [carte('c1'), carte('c2'), carte('c3')];
    noteLiveEvent({ type: 'CARDS_MOVED', cards: zone, from: BF, to: BF } as Event, 'seat_1', 'seat_0', new Map());
    expect(allumees()).toEqual([]);
  });

  it('réaligner un permanent sur son propre champ ne brille pas', () => {
    noteLiveEvent({ type: 'CARD_MOVED', card: carte('c1'), from: BF, to: BF } as Event, 'seat_1', 'seat_0', new Map());
    expect(allumees()).toEqual([]);
  });

  it('jouer trois fois la même carte n’allume que la dernière arrivée à chaque fois', () => {
    const avant = new Map<string, CardView>();
    for (const id of ['a', 'b', 'c']) {
      resetCues();
      noteLiveEvent({ type: 'CARD_MOVED', card: carte(id), from: HAND, to: BF } as Event, 'seat_1', 'seat_0', avant);
      noteLiveEvent(
        { type: 'CARDS_MOVED', cards: [...avant.values(), carte(id)], from: BF, to: BF } as Event,
        'seat_1',
        'seat_0',
        avant,
      );
      avant.set(id, carte(id));
      expect(allumees()).toEqual([id]);
    }
  });

  it('ses propres gestes ne brillent jamais', () => {
    noteLiveEvent({ type: 'CARD_MOVED', card: carte('c3'), from: HAND, to: BF } as Event, 'seat_0', 'seat_0', new Map());
    expect(allumees()).toEqual([]);
  });

  it('prendre le contrôle d’un permanent adverse, c’est une arrivée', () => {
    expect(entersBattlefield({ seat: 'seat_0', kind: 'BATTLEFIELD' }, BF)).toBe(true);
    expect(entersBattlefield(BF, BF)).toBe(false);
  });
});
