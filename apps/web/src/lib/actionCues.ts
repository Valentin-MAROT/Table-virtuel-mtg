/**
 * Ce que font les autres, rendu visible.
 *
 * Les gestes d'un adversaire ne se lisaient que dans le journal, en phrases :
 * qui regardait le plateau ne voyait rien bouger, ou voyait bouger sans savoir
 * quoi. On dérive ici, des événements **en direct**, deux indices visuels :
 *
 * - **la carte jouée** (`played`) : un adversaire pose une carte de sa main
 *   (ou de la zone de commandement, du cimetière, de l'exil, de la
 *   bibliothèque) sur le champ de bataille ou sur la pile, ou défausse / exile
 *   depuis sa main. `PlayedCardSpotlight` la montre en grand quelques secondes ;
 * - **les cartes touchées** (`touched`) : posées, engagées, retournées,
 *   marquées, attachées. `SeatPanel` les entoure d'un halo à la couleur de
 *   l'auteur, qui s'éteint seul.
 *
 * **Seulement en direct, seulement les autres.** Un rattrapage (resync,
 * reconnexion) rejoue des événements que personne n'a vus passer : les
 * annoncer maintenant serait du bruit. Ses propres gestes, on les a faits.
 *
 * **Le dégagement de début de tour ne brille pas** : vingt permanents qui
 * s'allument ensemble n'apprennent rien. On ne retient que ce qui *change* l'état
 * d'une carte dans un sens qui mérite l'œil : s'engager, se retourner, gagner ou
 * perdre un marqueur.
 */
import { create } from 'zustand';
import type { CardView, Event, PublicCardView, SeatId, ZoneKind, ZoneRef } from '@mtg/shared';

/** Durée d'un halo, en millisecondes. Doit suivre l'animation `cue-halo` (index.css). */
export const HALO_MS = 4500;
/** Durée d'une carte jouée à l'écran. */
export const PLAYED_MS = 4200;
/** Au-delà, les plus anciennes cartes jouées laissent la place. */
const PLAYED_MAX = 3;

export type PlayedVerb = 'battlefield' | 'stack' | 'graveyard' | 'exile';

export interface PlayedCue {
  id: number;
  seat: SeatId;
  card: PublicCardView;
  verb: PlayedVerb;
  from: ZoneKind;
}

interface CueState {
  played: PlayedCue[];
  /** carte → halo en cours ; `n` change à chaque nouveau geste, pour relancer l'animation. */
  touched: Map<string, { seat: SeatId; n: number }>;
}

export const useCues = create<CueState>(() => ({ played: [], touched: new Map() }));

let counter = 0;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Remet à zéro (changement de table). */
export function resetCues(): void {
  for (const t of timers.values()) globalThis.clearTimeout(t);
  timers.clear();
  useCues.setState({ played: [], touched: new Map() });
}

function touch(ids: readonly string[], seat: SeatId): void {
  if (ids.length === 0) return;
  const touched = new Map(useCues.getState().touched);
  for (const id of ids) {
    counter += 1;
    touched.set(id, { seat, n: counter });
    const previous = timers.get(id);
    if (previous) globalThis.clearTimeout(previous);
    const n = counter;
    timers.set(
      id,
      globalThis.setTimeout(() => {
        timers.delete(id);
        const current = useCues.getState().touched;
        if (current.get(id)?.n !== n) return;
        const next = new Map(current);
        next.delete(id);
        useCues.setState({ touched: next });
      }, HALO_MS),
    );
  }
  useCues.setState({ touched });
}

function play(cue: Omit<PlayedCue, 'id'>): void {
  counter += 1;
  const id = counter;
  const played = [...useCues.getState().played, { ...cue, id }].slice(-PLAYED_MAX);
  useCues.setState({ played });
  globalThis.setTimeout(() => {
    useCues.setState({ played: useCues.getState().played.filter((p) => p.id !== id) });
  }, PLAYED_MS);
}

/** Retire une carte jouée avant l'heure (clic dessus). */
export function dismissPlayed(id: number): void {
  useCues.setState({ played: useCues.getState().played.filter((p) => p.id !== id) });
}

const PLAY_TARGETS: Partial<Record<ZoneKind, PlayedVerb>> = {
  BATTLEFIELD: 'battlefield',
  STACK_NOTE: 'stack',
};
/** D'où l'on « joue » une carte : tout sauf le champ lui-même et les zones techniques. */
const PLAY_SOURCES: ReadonlySet<ZoneKind> = new Set(['HAND', 'COMMAND', 'GRAVEYARD', 'EXILE', 'LIBRARY']);

function isPublic(card: CardView): card is PublicCardView {
  return card.faceDown === false && 'scryfallId' in card && Boolean(card.scryfallId);
}

function verbFor(from: ZoneKind, to: ZoneKind): PlayedVerb | null {
  const target = PLAY_TARGETS[to];
  if (target && PLAY_SOURCES.has(from)) return target;
  // Défausser ou exiler depuis la main : la table doit savoir laquelle.
  if (from === 'HAND' && to === 'GRAVEYARD') return 'graveyard';
  if (from === 'HAND' && to === 'EXILE') return 'exile';
  return null;
}

/**
 * Une carte **arrive** sur le champ de bataille. Déplacer ou réaligner ce qui
 * y est déjà (terrains rangés, zone republiée dans son nouvel ordre) n'est pas
 * une arrivée, et ne brille pas.
 */
export function entersBattlefield(from: ZoneRef, to: ZoneRef): boolean {
  return to.kind === 'BATTLEFIELD' && !(from.kind === 'BATTLEFIELD' && from.seat === to.seat);
}

/** Ce qui, dans une mise à jour de carte, mérite le halo. */
function changedVisibly(before: CardView | undefined, after: CardView): boolean {
  if (!before) return false;
  if (after.zone.kind !== 'BATTLEFIELD') return false;
  if (!before.tapped && after.tapped) return true;
  if (before.faceDown !== after.faceDown) return true;
  if ('flipped' in before && 'flipped' in after && before.flipped !== after.flipped) return true;
  const key = (c: CardView): string =>
    c.counters
      .map((x) => `${x.kind}:${x.value}`)
      .sort()
      .join('|');
  return key(before) !== key(after);
}

/**
 * À appeler pour chaque événement **en direct**, *avant* de l'appliquer :
 * `before` est l'état des cartes tel qu'il était, pour comparer.
 */
export function noteLiveEvent(
  event: Event,
  actor: SeatId | null,
  mySeat: SeatId | null,
  before: ReadonlyMap<string, CardView>,
): void {
  if (!actor || actor === mySeat) return;
  switch (event.type) {
    case 'CARD_MOVED': {
      const verb = verbFor(event.from.kind, event.to.kind);
      if (verb && isPublic(event.card)) play({ seat: actor, card: event.card, verb, from: event.from.kind });
      if (entersBattlefield(event.from, event.to)) touch([event.card.id], actor);
      return;
    }
    case 'CARDS_MOVED':
      // Un `CARDS_MOVED` d'une zone vers elle-même n'est pas un geste : c'est
      // le serveur qui republie l'ordre de toute la zone après un rangement.
      // Le prendre pour une arrivée allumait chaque permanent du joueur à
      // chaque carte jouée.
      if (entersBattlefield(event.from, event.to)) touch(event.cards.map((c) => c.id), actor);
      return;
    case 'CARD_UPDATED':
      if (changedVisibly(before.get(event.card.id), event.card)) touch([event.card.id], actor);
      return;
    case 'TOKENS_CREATED':
      touch(
        event.cards.map((c) => c.id),
        actor,
      );
      return;
    case 'ATTACHED':
      touch([event.sourceId, event.targetId], actor);
      return;
    default:
      return;
  }
}
