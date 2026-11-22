/**
 * Début de tour en un clic et étape suivante (`lib/turn.ts`).
 *
 * Le bouton ne fait que réunir dégager + piocher + phase principale ; ce qui
 * doit rester juste, c'est la règle 103.8a — le premier joueur d'une partie à
 * deux ne pioche pas à son premier tour, en multijoueur si.
 */
import { describe, expect, it } from 'vitest';
import { drawsThisTurn, nextPhase } from '../src/lib/turn.js';

describe('début de tour', () => {
  it('pas de pioche au tout premier tour à deux', () => {
    expect(drawsThisTurn(1, 2)).toBe(false);
    expect(drawsThisTurn(2, 2)).toBe(true);
  });

  it('le premier joueur pioche en multijoueur', () => {
    expect(drawsThisTurn(1, 3)).toBe(true);
    expect(drawsThisTurn(1, 4)).toBe(true);
  });
});

describe('étape suivante', () => {
  it('avance dans l’ordre du tour', () => {
    expect(nextPhase('UNTAP')).toBe('UPKEEP');
    expect(nextPhase('MAIN1')).toBe('COMBAT');
    expect(nextPhase('MAIN2')).toBe('END');
  });

  it('après la fin, il ne reste qu’à passer le tour', () => {
    expect(nextPhase('END')).toBeNull();
  });
});
