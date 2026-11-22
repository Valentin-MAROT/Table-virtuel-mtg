/**
 * Les gestes des flèches, côté client : attaquer, bloquer, cibler.
 *
 * - **Attaquer** : à deux joueurs, la cible est évidente — l'adversaire —, et
 *   le geste part tout de suite : les créatures s'engagent (sauf vigilance) et
 *   une flèche rouge les relie au joueur attaqué. À plus de deux, on choisit le
 *   joueur d'un clic sur son plateau.
 * - **Bloquer** : un clic sur la créature attaquante.
 * - **Cibler** : un clic sur une carte ou sur le plateau d'un joueur.
 *
 * Le choix se fait dans un **mode de visée** (`useArrowPick`) que `ArrowLayer`
 * dessine et intercepte : une ligne suit le pointeur, Échap ou le clic droit
 * l'abandonnent. Rien de tout cela n'est imposé (§1.1) : engager à la main,
 * dire « j'attaque » au chat, tout reste possible.
 */
import { create } from 'zustand';
import type { ArrowEnd, ArrowKind } from '@mtg/shared';
import { useGame } from '../store/game.js';
import { cardMeta } from './cards.js';

export interface ArrowPick {
  kind: ArrowKind;
  from: string[];
}

export const useArrowPick = create<{ pick: ArrowPick | null }>(() => ({ pick: null }));

export function startPick(kind: ArrowKind, from: string[]): void {
  useArrowPick.setState({ pick: { kind, from } });
}

export function cancelPick(): void {
  useArrowPick.setState({ pick: null });
}

/** Qui peut-on attaquer : les autres sièges encore en jeu. */
function opponents(): string[] {
  const { seats, mySeat } = useGame.getState();
  return seats.filter((s) => s.id !== mySeat && !s.conceded).map((s) => s.id);
}

function hasVigilance(cardId: string): boolean {
  const card = useGame.getState().cards.get(cardId);
  if (!card || !('scryfallId' in card) || !card.scryfallId) return false;
  // Face cachée, une créature n'a aucune capacité (708.2a) : elle s'engage,
  // même si son recto — que son propriétaire voit — a la vigilance.
  if (card.facedownOnTable) return false;
  return (cardMeta(card.scryfallId)?.keywords ?? []).some((k) => k.toLowerCase() === 'vigilance');
}

/** Trace les flèches ; une attaque engage en plus ce qui n'a pas la vigilance. */
export function sendArrows(kind: ArrowKind, from: string[], to: ArrowEnd): void {
  const { send, cards } = useGame.getState();
  // L'engagement part **dans** l'intent : une seule action, donc une seule
  // annulation pour défaire et l'engagement et les flèches.
  const tap = kind === 'ATTACK' ? from.filter((id) => cards.get(id)?.tapped === false && !hasVigilance(id)) : [];
  send({ type: 'ADD_ARROWS', kind, from, to, ...(tap.length > 0 ? { tap } : {}) });
}

/** « Attaquer » : direct à deux joueurs, sinon on choisit le joueur. */
export function declareAttack(from: string[]): void {
  const others = opponents();
  if (others.length === 1) sendArrows('ATTACK', from, { seat: others[0]! });
  else startPick('ATTACK', from);
}
