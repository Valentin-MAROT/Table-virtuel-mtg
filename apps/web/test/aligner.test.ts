/**
 * « Aligner » range une sélection sans trous et sans rien perdre.
 *
 * Retour de table (octobre 2026) : l'alignement laissait une carte entière
 * d'écart entre deux permanents, et au-delà de quelques rangées des cartes
 * « disparaissaient » — elles partaient sous le bord du panneau, qui les coupe.
 * Ce test garde les deux promesses : le pas suit la carte affichée, et chaque
 * rectangle visible reste dans le terrain, quel que soit le nombre de cartes.
 */
import { describe, expect, it } from 'vitest';
import { ALIGN_GAP, alignPositions } from '../src/lib/align.js';
import { BATTLEFIELD_BOUNDS, LAND_SLOT_H, LAND_SLOT_W } from '../src/lib/landLayout.js';

interface C {
  id: string;
  x: number;
  y: number;
  tapped: boolean;
  rotation: 0 | 90 | 180 | 270;
  attachedTo?: string;
}

function carte(id: string, x: number, y: number, tapped = false): C {
  return { id, x, y, tapped, rotation: 0 };
}

/** Rectangle visible d'une carte posée en (x, y) : une carte engagée est couchée. */
function visible(c: C, at: { x: number; y: number }): { l: number; t: number; r: number; b: number } {
  const shift = c.tapped ? (LAND_SLOT_H - LAND_SLOT_W) / 2 : 0;
  const w = c.tapped ? LAND_SLOT_H : LAND_SLOT_W;
  const h = c.tapped ? LAND_SLOT_W : LAND_SLOT_H;
  return { l: at.x - shift, t: at.y + shift, r: at.x - shift + w, b: at.y + shift + h };
}

describe('aligner', () => {
  it('serre les cartes au pas de la carte affichée, depuis le coin de la sélection', () => {
    const cards = [carte('a', 300, 200), carte('b', 100, 210), carte('c', 700, 190)];
    const at = alignPositions(cards);
    expect(at.get('b')).toEqual({ x: 100, y: 190 });
    expect(at.get('a')!.x - at.get('b')!.x).toBe(LAND_SLOT_W + ALIGN_GAP);
    expect(at.get('c')!.x - at.get('a')!.x).toBe(LAND_SLOT_W + ALIGN_GAP);
  });

  it('compte une carte engagée couchée, sans chevaucher sa voisine', () => {
    const cards = [carte('a', 0, 0, true), carte('b', 400, 0)];
    const at = alignPositions(cards);
    const ra = visible(cards[0]!, at.get('a')!);
    const rb = visible(cards[1]!, at.get('b')!);
    expect(ra.l).toBe(0);
    expect(rb.l).toBe(ra.r + ALIGN_GAP);
  });

  it('passe à la ligne au bord droit', () => {
    const cards = Array.from({ length: 20 }, (_, i) => carte(`c${i}`, i * 10, 0));
    const at = alignPositions(cards);
    const rows = new Set([...at.values()].map((p) => p.y));
    expect(rows.size).toBeGreaterThan(1);
  });

  it.each([5, 30, 60, 120])('%i cartes restent toutes dans le terrain', (n) => {
    const cards = Array.from({ length: n }, (_, i) => carte(`c${i}`, 500 + (i % 7), 500, i % 3 === 0));
    const at = alignPositions(cards);
    expect(at.size).toBe(n);
    for (const c of cards) {
      const r = visible(c, at.get(c.id)!);
      expect(r.l).toBeGreaterThanOrEqual(-0.5);
      expect(r.t).toBeGreaterThanOrEqual(-0.5);
      expect(r.r).toBeLessThanOrEqual(BATTLEFIELD_BOUNDS.width + 0.5);
      expect(r.b).toBeLessThanOrEqual(BATTLEFIELD_BOUNDS.height + 0.5);
    }
  });

  it("laisse une carte attachée suivre son porteur", () => {
    const at = alignPositions([carte('crea', 0, 0), { ...carte('aura', 0, 0), attachedTo: 'crea' }]);
    expect(at.has('aura')).toBe(false);
  });
});
