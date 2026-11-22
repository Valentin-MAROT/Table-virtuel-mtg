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
 * - `pruneArrows`, à chaque `commit` de la room — intent, annulation, départ
 *   d'un siège, relance —, efface celles dont une extrémité a quitté le champ
 *   de bataille (ou la pile), dont le siège visé est parti, ou dont l'auteur
 *   est parti ou a concédé ;
 * - `clearAllArrows` les efface toutes au passage du tour.
 */
import { ulid } from 'ulid';
import type { Arrow, ArrowEnd, Intent, ObjectId } from '@mtg/shared';
import { IntentError } from './errors.js';
import { CARTE_ANONYME, cardUpdate, namedBatch, publicName, type Emission, type IntentResult } from './engine.js';
import type { GameObjectState, GameState, SeatState } from './state.js';

const ALL = { kind: 'ALL' } as const;
/** Par joueur : au-delà, c'est un abus, pas une partie — et un seul joueur ne
 *  doit pas pouvoir remplir la table au point d'empêcher les autres. */
export const MAX_ARROWS_PER_SEAT = 32;

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
  if (seat.conceded) throw new IntentError('ERR_PAYLOAD', 'Vous avez concédé.');

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
    // On n'attaque pas son propre planeswalker, on ne bloque pas sa propre
    // créature : ce serait une flèche qui ne dit rien de vrai.
    if (intent.kind !== 'TARGET' && target.controller === seatId) {
      throw new IntentError('ERR_PAYLOAD', 'Cette carte est à vous.');
    }
  }

  // Les attaquants à engager : seulement parmi les sources, et encore dégagés.
  const fromIds = new Set(sources.map((s) => s.id));
  const toTap = intent.kind === 'ATTACK'
    ? [...new Set(intent.tap ?? [])].map((id) => state.objects.get(id)).filter(
        (o): o is GameObjectState => Boolean(o && fromIds.has(o.id) && !o.tapped && o.zone.kind === 'BATTLEFIELD'),
      )
    : [];
  if (intent.kind !== 'ATTACK' && intent.tap && intent.tap.length > 0) {
    throw new IntentError('ERR_PAYLOAD', 'Seule une attaque engage.');
  }

  // Une attaque, un blocage : une seule flèche de cette nature par carte.
  // Une cible : pas deux fois la même flèche.
  const sameEnd = (a: ArrowEnd): boolean =>
    'seat' in a ? 'seat' in to && a.seat === to.seat : 'card' in to && a.card === to.card;
  const replaced: Arrow[] = [];
  const duplicate = new Set<ObjectId>();
  for (const arrow of state.arrows.values()) {
    if (arrow.kind !== intent.kind || !fromIds.has(arrow.from)) continue;
    if (intent.kind !== 'TARGET') replaced.push(arrow);
    else if (sameEnd(arrow.to)) duplicate.add(arrow.from);
  }
  const fresh = sources.filter((s) => !duplicate.has(s.id));
  if (fresh.length === 0 && toTap.length === 0) return { emissions: [] };
  const mine = [...state.arrows.values()].filter((a) => a.seat === seatId).length;
  if (mine - replaced.length + fresh.length > MAX_ARROWS_PER_SEAT) {
    throw new IntentError('ERR_PAYLOAD', 'Trop de flèches : retirez-en avant d’en tracer d’autres.');
  }
  for (const a of replaced) state.arrows.delete(a.id);

  const added: Arrow[] = fresh.map((s) => ({ id: ulid(), seat: seatId, kind: intent.kind, from: s.id, to }));
  for (const a of added) state.arrows.set(a.id, a);
  for (const o of toTap) o.tapped = true;

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
  const replacedIds = replaced.map((a) => a.id);
  if (replacedIds.length > 0) {
    emissions.push({ audience: ALL, build: () => ({ type: 'ARROWS_REMOVED', ids: replacedIds }) });
  }
  emissions.push(...toTap.map(cardUpdate));
  emissions.push({
    audience: ALL,
    build: () => ({ type: 'ARROWS_ADDED', arrows: added }),
    log: { text: `${seat.displayName} ${VERB[intent.kind]} ${targetText} avec ${sourceText}`, cardIds: anchors },
  });

  /*
   * Annulable comme n'importe quel geste : une attaque lancée par erreur se
   * défait d'un Ctrl+Z — les flèches partent, les attaquants se dégagent, et
   * les flèches qu'elle avait remplacées reviennent.
   */
  const addedIds = added.map((a) => a.id);
  const tappedIds = toTap.map((o) => o.id);
  return {
    emissions,
    undo: {
      at: Date.now(),
      run: () => {
        const out: Emission[] = [];
        const gone = addedIds.filter((id) => state.arrows.delete(id));
        if (gone.length > 0) out.push({ audience: ALL, build: () => ({ type: 'ARROWS_REMOVED', ids: gone }) });
        for (const id of tappedIds) {
          const obj = state.objects.get(id);
          if (obj && obj.tapped) {
            obj.tapped = false;
            out.push(cardUpdate(obj));
          }
        }
        const back = replaced.filter((a) => onTable(state.objects.get(a.from)) && endAlive(state, a.to));
        for (const a of back) state.arrows.set(a.id, a);
        if (back.length > 0) out.push({ audience: ALL, build: () => ({ type: 'ARROWS_ADDED', arrows: back }) });
        return out;
      },
    },
  };
}

/** Efface les flèches dont une extrémité n'est plus sur la table. */
export function pruneArrows(state: GameState): Emission[] {
  if (state.arrows.size === 0) return [];
  const dead: ObjectId[] = [];
  for (const arrow of state.arrows.values()) {
    const drawer = state.seats.get(arrow.seat);
    const seatGone = !drawer || drawer.conceded;
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
