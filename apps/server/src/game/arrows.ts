/**
 * Les flèches : cibler, attaquer, bloquer (docs/protocol.md, § flèches).
 *
 * Déclaratives comme tout le reste (§1.1) : une flèche ne tape, ne détruit, ne
 * résout rien. Elle montre à la table ce que le joueur fait — « j'attaque
 * Alice avec ces deux-là », « je bloque le Wurm avec mon Elfe » — là où il
 * fallait le dire à voix haute ou le lire au journal.
 *
 * Trois règles d'entretien, pour qu'aucune flèche ne désigne un objet mort :
 * - une attaque ou un blocage **remplace** la flèche de même nature déjà partie
 *   de la même carte (on n'attaque qu'une cible, on ne bloque qu'un attaquant) ;
 * - `pruneArrows`, après chaque intent, efface celles dont une extrémité a
 *   quitté le champ de bataille (ou la pile), ou dont le siège visé est parti ;
 * - `clearAllArrows` les efface toutes au passage du tour.
 */
import { ulid } from 'ulid';
import type { Arrow, ArrowEnd, Intent, ObjectId } from '@mtg/shared';
import { IntentError } from './errors.js';
import { CARTE_ANONYME, namedBatch, publicName, type Emission, type IntentResult } from './engine.js';
import type { GameObjectState, GameState, SeatState } from './state.js';

const ALL = { kind: 'ALL' } as const;
/** Au-delà, c'est un abus, pas une partie. */
export const MAX_ARROWS = 96;

const ARROW_ZONES = new Set(['BATTLEFIELD', 'STACK_NOTE']);

function onTable(obj: GameObjectState | undefined): obj is GameObjectState {
  return Boolean(obj && ARROW_ZONES.has(obj.zone.kind));
}

function endAlive(state: GameState, end: ArrowEnd): boolean {
  if ('seat' in end) {
    const seat = state.seats.get(end.seat);
    return Boolean(seat && !seat.conceded);
  }
  return onTable(state.objects.get(end.card));
}

const VERB: Record<Arrow['kind'], string> = { ATTACK: 'attaque', BLOCK: 'bloque', TARGET: 'cible' };

export function applyArrowIntent(
  state: GameState,
  seat: SeatState,
  intent: Extract<Intent, { type: 'ADD_ARROWS' | 'CLEAR_ARROWS' }>,
): IntentResult {
  if (state.status !== 'PLAYING') {
    throw new IntentError('ERR_GAME_NOT_STARTED', 'La partie n’a pas commencé.');
  }
  const seatId = seat.id;

  if (intent.type === 'CLEAR_ARROWS') {
    const ids = [...state.arrows.values()].filter((a) => a.seat === seatId).map((a) => a.id);
    if (ids.length === 0) return { emissions: [] };
    for (const id of ids) state.arrows.delete(id);
    return {
      emissions: [
        {
          audience: ALL,
          build: () => ({ type: 'ARROWS_REMOVED', ids }),
          log: { text: `${seat.displayName} retire ses flèches`, cardIds: [] },
        },
      ],
    };
  }

  // — ADD_ARROWS ————————————————————————————————————————————————
  const sources: GameObjectState[] = [];
  for (const id of new Set(intent.from)) {
    const obj = state.objects.get(id);
    if (!obj) throw new IntentError('ERR_UNKNOWN_OBJECT', 'Carte inconnue.');
    if (!onTable(obj)) throw new IntentError('ERR_BAD_ZONE', 'Une flèche part du champ de bataille ou de la pile.');
    // On attaque et on bloque avec ses propres créatures ; on cible avec ce
    // qu'on contrôle (un sort, une capacité).
    if (obj.controller !== seatId) throw new IntentError('ERR_NOT_YOURS', 'Cette carte ne vous appartient pas.');
    sources.push(obj);
  }

  const to = intent.to;
  if ('seat' in to) {
    if (!endAlive(state, to)) throw new IntentError('ERR_PAYLOAD', 'Ce joueur n’est plus à la table.');
    if (intent.kind === 'BLOCK') throw new IntentError('ERR_PAYLOAD', 'On bloque une créature, pas un joueur.');
    if (intent.kind === 'ATTACK' && to.seat === seatId) {
      throw new IntentError('ERR_PAYLOAD', 'On n’attaque pas soi-même.');
    }
  } else {
    const target = state.objects.get(to.card);
    if (!target) throw new IntentError('ERR_UNKNOWN_OBJECT', 'Cible inconnue.');
    if (!onTable(target)) throw new IntentError('ERR_BAD_ZONE', 'La cible doit être sur le champ de bataille ou la pile.');
    if (sources.some((s) => s.id === target.id)) throw new IntentError('ERR_PAYLOAD', 'Une carte ne se vise pas elle-même.');
  }

  // Une attaque, un blocage : une seule flèche de cette nature par carte.
  const replaced: ObjectId[] = [];
  if (intent.kind !== 'TARGET') {
    const fromIds = new Set(sources.map((s) => s.id));
    for (const arrow of state.arrows.values()) {
      if (arrow.kind === intent.kind && fromIds.has(arrow.from)) replaced.push(arrow.id);
    }
  }
  if (state.arrows.size - replaced.length + sources.length > MAX_ARROWS) {
    throw new IntentError('ERR_PAYLOAD', 'Trop de flèches sur la table.');
  }
  for (const id of replaced) state.arrows.delete(id);

  const added: Arrow[] = sources.map((s) => ({ id: ulid(), seat: seatId, kind: intent.kind, from: s.id, to }));
  for (const a of added) state.arrows.set(a.id, a);

  const named = namedBatch(sources, state, 'BATTLEFIELD');
  const sourceText = named?.names ?? `${sources.length} carte(s)`;
  let targetText: string;
  const anchors = [...(named?.cardIds ?? [])];
  if ('seat' in to) {
    targetText = state.seats.get(to.seat)!.displayName;
  } else {
    const target = state.objects.get(to.card)!;
    targetText = publicName(target, state);
    if (targetText !== CARTE_ANONYME) anchors.push(target.id);
  }

  const emissions: Emission[] = [];
  if (replaced.length > 0) {
    emissions.push({ audience: ALL, build: () => ({ type: 'ARROWS_REMOVED', ids: replaced }) });
  }
  emissions.push({
    audience: ALL,
    build: () => ({ type: 'ARROWS_ADDED', arrows: added }),
    log: { text: `${seat.displayName} ${VERB[intent.kind]} ${targetText} avec ${sourceText}`, cardIds: anchors },
  });
  return { emissions };
}

/** Efface les flèches dont une extrémité n'est plus sur la table. */
export function pruneArrows(state: GameState): Emission[] {
  if (state.arrows.size === 0) return [];
  const dead: ObjectId[] = [];
  for (const arrow of state.arrows.values()) {
    const seatGone = !state.seats.has(arrow.seat);
    if (seatGone || !onTable(state.objects.get(arrow.from)) || !endAlive(state, arrow.to)) dead.push(arrow.id);
  }
  if (dead.length === 0) return [];
  for (const id of dead) state.arrows.delete(id);
  return [{ audience: ALL, build: () => ({ type: 'ARROWS_REMOVED', ids: dead }) }];
}

/** Toutes les flèches, au passage du tour. */
export function clearAllArrows(state: GameState): Emission[] {
  if (state.arrows.size === 0) return [];
  const ids = [...state.arrows.keys()];
  state.arrows.clear();
  return [{ audience: ALL, build: () => ({ type: 'ARROWS_REMOVED', ids }) }];
}
