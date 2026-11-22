/**
 * Destinations offertes sous chaque carte d'une consultation (`lib/lookBuckets.ts`).
 *
 * Scry : chaque carte reste dessus ou part dessous. Surveil : dessus ou
 * cimetière. Le regard n'a pas de règle propre ; dessus,
 * dessous ou en main en sont les issues courantes. La fouille garde ses
 * destinations de tuteur.
 */
import { describe, expect, it } from 'vitest';
import { primaryBucket, quickBuckets } from '../src/lib/lookBuckets.js';

describe('boutons sous la carte', () => {
  it('scry : dessus ou dessous, rien d’autre en premier plan', () => {
    expect(quickBuckets('SCRY')).toEqual(['top', 'bottom']);
  });

  it('surveil : dessus ou cimetière', () => {
    expect(quickBuckets('SURVEIL')).toEqual(['top', 'graveyard']);
  });

  it('regard : dessus, dessous ou en main', () => {
    expect(quickBuckets('PEEK')).toEqual(['top', 'bottom', 'hand']);
  });

  it('fouille et révélation gardent main et champ', () => {
    expect(quickBuckets('SEARCH')).toEqual(['hand', 'battlefield']);
    expect(quickBuckets('REVEAL')).toEqual(['hand', 'battlefield']);
  });
});

describe('geste principal (double-clic, flèche bas)', () => {
  it('envoie dessous au scry et au regard, au cimetière au surveil', () => {
    expect(primaryBucket('SCRY')).toBe('bottom');
    expect(primaryBucket('PEEK')).toBe('bottom');
    expect(primaryBucket('SURVEIL')).toBe('graveyard');
  });

  it('prend en main pendant une fouille, comme avant', () => {
    expect(primaryBucket('SEARCH')).toBe('hand');
  });
});
