/**
 * Quelles cartes sont des commandants.
 *
 * Le protocole ne le dit pas sur la carte, mais la table le sait : un
 * commandant commence en zone de commandement, qui est publique. Toute carte
 * vue dans une zone de commandement est donc retenue ici pour la partie — son
 * identifiant ne change pas en circulant entre zones publiques. Celles qui ont
 * une taxe complètent la liste pour un joueur arrivé après leur sortie.
 *
 * Sert à proposer « Renvoyer en zone de commandement » (menu, touche K) sur
 * les seules cartes où ce geste a un sens.
 */
import type { CardView, ObjectId, SeatSummary } from '@mtg/shared';

const seen = new Set<ObjectId>();

export function noteCommander(card: CardView): void {
  if (card.zone.kind === 'COMMAND') seen.add(card.id);
}

export function isCommander(card: CardView, seats: readonly SeatSummary[]): boolean {
  if (seen.has(card.id)) return true;
  return seats.some((s) => s.commanderTax[card.id] !== undefined);
}
