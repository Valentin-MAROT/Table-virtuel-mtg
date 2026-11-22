/**
 * Le journal se lit par tours, et une action répétée tient sur une ligne.
 *
 * Retour de table (Bryan, 13/10/2026) : « toujours le manque de lisibilité dans
 * l'historique », et « regrouper la ligne en genre a fait ça ×3 » quand on engage
 * trois jetons identiques. Le test garde les deux règles de `blocsDuJournal` :
 * un bloc par numéro de tour, et une fusion qui n'avale jamais un fait distinct
 * ni une ligne qui a son propre lot à déplier.
 */
import { describe, expect, it } from 'vitest';
import { NAMED_LOG_LIMIT, type LogEntry } from '@mtg/shared';
import { blocsDuJournal } from '../src/components/ActionLog.js';

let seq = 0;
function ligne(
  actor: string | null,
  text: string,
  tour: number | undefined,
  cardIds: string[] = [],
  extra: Partial<LogEntry> = {},
): LogEntry {
  seq += 1;
  return {
    seq,
    at: seq,
    actor,
    text,
    cardIds,
    ...(tour === undefined ? {} : { turn: { number: tour, seat: tour % 2 ? 'seat_0' : 'seat_1' } }),
    ...extra,
  };
}

describe('journal découpé par tours', () => {
  it('ouvre un bloc à chaque changement de numéro de tour', () => {
    const blocs = blocsDuJournal([
      ligne('seat_0', 'Alice a pris un mulligan', 0),
      ligne('seat_0', 'Alice a pioché une carte', 1),
      ligne('seat_0', 'Alice a joué Forest', 1),
      ligne('seat_0', 'Alice a passé le tour à Bob', 2),
      ligne('seat_1', 'Bob a pioché une carte', 2),
    ]);
    expect(blocs.map((b) => b.turn?.number)).toEqual([0, 1, 2]);
    expect(blocs.map((b) => b.lignes.length)).toEqual([1, 2, 2]);
    expect(blocs[2]!.turn?.seat).toBe('seat_1');
  });

  it('une ligne sans estampille reste dans le bloc courant', () => {
    const blocs = blocsDuJournal([
      ligne('seat_0', 'ancienne ligne', undefined),
      ligne('seat_0', 'a pioché', 3),
      ligne('seat_0', 'encore ancienne', undefined),
    ]);
    expect(blocs).toHaveLength(2);
    expect(blocs[0]!.turn).toBeUndefined();
    expect(blocs[1]!.lignes).toHaveLength(2);
  });
});

describe('répétitions repliées en ×N', () => {
  it('trois engagements identiques donnent une ligne ×3 qui ancre les trois jetons', () => {
    const [bloc] = blocsDuJournal([
      ligne('seat_0', 'Alice a engagé Treasure', 4, ['t1']),
      ligne('seat_0', 'Alice a engagé Treasure', 4, ['t2']),
      ligne('seat_0', 'Alice a engagé Treasure', 4, ['t3']),
    ]);
    expect(bloc!.lignes).toHaveLength(1);
    expect(bloc!.lignes[0]!.fois).toBe(3);
    expect(bloc!.lignes[0]!.cardIds).toEqual(['t1', 't2', 't3']);
  });

  it('ne fusionne ni un autre auteur, ni un autre texte, ni par-dessus une autre ligne', () => {
    const [bloc] = blocsDuJournal([
      ligne('seat_0', 'a engagé Treasure', 4),
      ligne('seat_1', 'a engagé Treasure', 4),
      ligne('seat_1', 'a engagé Clue', 4),
      ligne('seat_1', 'a engagé Treasure', 4),
    ]);
    expect(bloc!.lignes.map((l) => l.fois)).toEqual([1, 1, 1, 1]);
  });

  it('ne fusionne pas à travers un changement de tour', () => {
    const blocs = blocsDuJournal([
      ligne('seat_0', 'a dégagé tout', 4),
      ligne('seat_0', 'a dégagé tout', 5),
    ]);
    expect(blocs).toHaveLength(2);
  });

  it('une ligne abrégée garde son propre lot à déplier', () => {
    const lot = Array.from({ length: NAMED_LOG_LIMIT + 1 }, (_, i) => `c${i}`);
    const [bloc] = blocsDuJournal([
      ligne('seat_0', 'a meulé 7 cartes', 4, lot),
      ligne('seat_0', 'a meulé 7 cartes', 4, lot),
    ]);
    expect(bloc!.lignes).toHaveLength(2);
  });

  it("n'altère pas les entrées du store", () => {
    const a = ligne('seat_0', 'x', 1, ['a']);
    const b = ligne('seat_0', 'x', 1, ['b']);
    blocsDuJournal([a, b]);
    expect(a.cardIds).toEqual(['a']);
  });
});
