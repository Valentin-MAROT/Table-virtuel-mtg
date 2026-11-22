/**
 * Treachery : distribution des identités, dévoilement, et victoire par équipe.
 *
 * Tout ce que ce mode ajoute au serveur est ici, et ce fichier est avec
 * `projection.ts` le **seul** endroit qui décide qui connaît une identité. La
 * règle tient en une ligne — `canSeeTreacheryIdentity` — et elle est la même
 * pour le snapshot et pour les events, comme l'exige la §8.1 du protocole.
 *
 * Règles suivies : https://mtgtreachery.net/rules/cr/, 907 et 702.TR01. Comme
 * partout sur cette table (§1.1), le serveur **tient l'état** et ne joue pas à
 * la place des joueurs : il distribue, il retourne les cartes, il constate
 * qu'une équipe a gagné. Il ne vérifie ni un coût de dévoilement ni la
 * restriction *undercover*, pas plus qu'il ne vérifie un coût de mana.
 */
import {
  TREACHERY_IDENTITIES,
  TREACHERY_ROLES,
  treacheryDistribution,
  treacheryIdentity,
  treacheryTeam,
  type Snapshot,
  type SeatId,
  type TreacheryDistribution,
  type TreacheryIdentityView,
  type TreacheryOutcome,
  type TreacheryRole,
} from '@mtg/shared';
import type { Emission } from './engine.js';
import type { RandomSource } from './random.js';
import { OMNISCIENT_SEAT, type GameState, type SeatState } from './state.js';

export interface TreacheryIdentityState {
  seat: SeatId;
  /**
   * Nom du joueur au moment de la distribution. Un siège qui quitte la table
   * disparaît de `state.seats`, mais la partie se souvient de son équipe
   * (907.12) : il faut encore pouvoir le nommer à la fin.
   */
  displayName: string;
  role: TreacheryRole;
  cardId: number;
  /** Face visible : connue de toute la table. */
  unveiled: boolean;
  /** Le joueur a perdu — concession ou départ. */
  lost: boolean;
}

export interface TreacheryState {
  distribution: TreacheryDistribution;
  identities: Map<SeatId, TreacheryIdentityState>;
}

const ROLE_LABELS: Record<TreacheryRole, string> = {
  LEADER: 'Leader',
  GUARDIAN: 'Gardien',
  ASSASSIN: 'Assassin',
  TRAITOR: 'Traître',
};

/** « The Ætherist (Gardien) » — ce que le journal écrit d'une identité visible. */
export function identityLabel(identity: TreacheryIdentityState): string {
  const card = treacheryIdentity(identity.cardId);
  const role = ROLE_LABELS[identity.role];
  return card ? `${card.name} (${role})` : role;
}

/**
 * Le siège `viewer` a-t-il le droit de connaître cette identité ?
 *
 * **Unique règle de visibilité des identités.** Une carte face visible est
 * connue de tous ; une carte face cachée n'est connue que de son joueur
 * (372.8). Le siège omniscient est celui du replay, et de lui seul.
 */
export function canSeeTreacheryIdentity(
  identity: TreacheryIdentityState,
  viewer: SeatId | null,
): boolean {
  if (viewer === null) return false;
  if (viewer === OMNISCIENT_SEAT) return true;
  return identity.unveiled || identity.seat === viewer;
}

export function toIdentityView(identity: TreacheryIdentityState): TreacheryIdentityView {
  return {
    seat: identity.seat,
    displayName: identity.displayName,
    role: identity.role,
    cardId: identity.cardId,
    unveiled: identity.unveiled,
  };
}

/** La part Treachery d'un snapshot, pour ce siège. `undefined` hors partie. */
export function projectTreachery(
  state: GameState,
  viewer: SeatId | null,
): Snapshot['treachery'] | undefined {
  const treachery = state.treachery;
  // Pas de spectateurs (§13.4) : une connexion sans siège n'apprend rien de la
  // partie, pas même la répartition.
  if (!treachery || viewer === null) return undefined;
  return {
    distribution: { ...treachery.distribution },
    identities: [...treachery.identities.values()]
      .filter((identity) => canSeeTreacheryIdentity(identity, viewer))
      .map(toIdentityView),
  };
}

/** L'annonce publique d'une identité : la carte est face visible. */
function shownToAll(identity: TreacheryIdentityState): Emission {
  return {
    audience: { kind: 'ALL' },
    build: () => ({ type: 'IDENTITY_SHOWN', identity: toIdentityView(identity) }),
  };
}

/**
 * Distribue une identité à chaque siège (907.4).
 *
 * Les rôles sont tirés selon la répartition recommandée pour ce nombre de
 * joueurs, puis chaque joueur reçoit **une carte** de son rôle, sans doublon.
 * Le Leader est face visible d'emblée — aucune carte de Leader n'a de
 * dévoilement — et c'est lui qui commence (907.7) : son siège est rendu à
 * l'appelant.
 *
 * `null` si le nombre de joueurs sort de la plage jouable : l'appelant refuse
 * alors de lancer.
 */
export function dealIdentities(
  state: GameState,
  seats: readonly SeatState[],
  rng: RandomSource,
): { leader: SeatState; emissions: Emission[] } | null {
  const distribution = treacheryDistribution(seats.length);
  if (!distribution) return null;

  const roles: TreacheryRole[] = [];
  for (const role of TREACHERY_ROLES) {
    for (let i = 0; i < distribution[role]; i++) roles.push(role);
  }
  rng.shuffle(roles);

  // Une pioche par rôle, mélangée : on y prend une carte par joueur, et deux
  // Assassins ne reçoivent donc jamais la même.
  const piles = new Map<TreacheryRole, number[]>();
  for (const role of TREACHERY_ROLES) {
    piles.set(
      role,
      rng.shuffle(TREACHERY_IDENTITIES.filter((c) => c.role === role).map((c) => c.id)),
    );
  }

  const identities = new Map<SeatId, TreacheryIdentityState>();
  let leader: SeatState | undefined;
  seats.forEach((seat, i) => {
    const role = roles[i]!;
    const cardId = piles.get(role)!.pop()!;
    identities.set(seat.id, {
      seat: seat.id,
      displayName: seat.displayName,
      role,
      cardId,
      unveiled: role === 'LEADER',
      lost: false,
    });
    if (role === 'LEADER') leader = seat;
  });
  if (!leader) return null;

  state.treachery = { distribution, identities };

  const emissions: Emission[] = [
    {
      audience: { kind: 'ALL' },
      build: () => ({ type: 'TREACHERY_SETUP', distribution: { ...distribution } }),
      log: { text: `Treachery — ${distributionLabel(distribution)}`, cardIds: [] },
    },
  ];
  for (const identity of identities.values()) {
    if (identity.unveiled) {
      emissions.push({
        ...shownToAll(identity),
        log: {
          // Le rôle est déjà dit : on ne nomme ici que la carte.
          text: `${identity.displayName} est le Leader : ${treacheryIdentity(identity.cardId)?.name ?? ''}`,
          cardIds: [],
        },
      });
    } else {
      // Chacun regarde sa carte, et personne d'autre : l'audience est le siège.
      emissions.push({
        audience: { kind: 'SEAT', seat: identity.seat },
        build: () => ({ type: 'IDENTITY_SHOWN', identity: toIdentityView(identity) }),
      });
    }
  }
  return { leader, emissions };
}

function distributionLabel(distribution: TreacheryDistribution): string {
  const parts: string[] = [];
  const add = (count: number, one: string, many: string): void => {
    if (count > 0) parts.push(`${count} ${count > 1 ? many : one}`);
  };
  add(distribution.LEADER, 'Leader', 'Leaders');
  add(distribution.GUARDIAN, 'Gardien', 'Gardiens');
  add(distribution.ASSASSIN, 'Assassin', 'Assassins');
  add(distribution.TRAITOR, 'Traître', 'Traîtres');
  return parts.join(', ');
}

/**
 * Retourne l'identité d'un siège face visible, si elle ne l'est pas déjà.
 *
 * `reason` choisit la phrase du journal : un dévoilement est un geste du
 * joueur, une élimination le lui impose (702.TR01f).
 */
export function revealIdentity(
  state: GameState,
  seatId: SeatId,
  reason: 'UNVEIL' | 'LOST',
): Emission[] {
  const identity = state.treachery?.identities.get(seatId);
  if (!identity || identity.unveiled) return [];
  identity.unveiled = true;
  const label = identityLabel(identity);
  return [
    {
      ...shownToAll(identity),
      log: {
        text:
          reason === 'UNVEIL'
            ? `${identity.displayName} dévoile son identité : ${label}`
            : `${identity.displayName} était ${label}`,
        cardIds: [],
      },
    },
  ];
}

/**
 * Un joueur vient de perdre — il a concédé, ou il a quitté la table.
 *
 * Son identité est révélée (702.TR01f), puis on regarde si la partie est
 * décidée. Si elle l'est, tout ce qui restait caché est retourné (907.13),
 * l'état passe à `ENDED` et le `GAME_ENDED` nomme l'équipe gagnante.
 *
 * À appeler **après** avoir marqué la défaite dans `state.seats` (siège concédé
 * ou retiré) : c'est de là que se lit qui est encore en jeu.
 */
export function playerLost(state: GameState, seatId: SeatId): Emission[] {
  const treachery = state.treachery;
  const identity = treachery?.identities.get(seatId);
  if (!treachery || !identity || state.status !== 'PLAYING') return [];
  identity.lost = true;

  const emissions = revealIdentity(state, seatId, 'LOST');
  const outcome = treacheryOutcome(state);
  if (!outcome) return emissions;

  for (const other of treachery.identities.values()) {
    if (other.unveiled) continue;
    other.unveiled = true;
    emissions.push({
      ...shownToAll(other),
      log: { text: `${other.displayName} était ${identityLabel(other)}`, cardIds: [] },
    });
  }

  state.status = 'ENDED';
  const { team, winners } = outcome;
  emissions.push({
    audience: { kind: 'ALL' },
    build: () => ({
      type: 'GAME_ENDED',
      reason: 'CONCEDE',
      winners: [...winners],
      ...(team ? { team } : {}),
    }),
    log: { text: outcomeLabel(treachery, outcome), cardIds: [] },
  });
  return emissions;
}

function outcomeLabel(treachery: TreacheryState, outcome: TreacheryOutcome): string {
  const names = (roles: TreacheryRole[]): string =>
    [...treachery.identities.values()]
      .filter((i) => roles.includes(i.role))
      .map((i) => i.displayName)
      .join(', ');
  switch (outcome.team) {
    case 'LEADER':
      return `Le Leader et ses Gardiens remportent la partie (${names(['LEADER', 'GUARDIAN'])})`;
    case 'ASSASSINS':
      return `Les Assassins remportent la partie (${names(['ASSASSIN'])})`;
    case 'TRAITOR': {
      const winner = treachery.identities.get(outcome.winners[0] ?? '');
      return `Le Traître remporte la partie (${winner?.displayName ?? '?'})`;
    }
    default:
      return 'La partie se termine sans vainqueur';
  }
}

/**
 * La partie est-elle décidée ? `null` tant qu'elle continue.
 *
 * Les conditions sont celles de la règle 907.8, lues dans cet ordre :
 *
 * - **Le Leader est encore en jeu.** Son équipe gagne quand il ne reste plus ni
 *   Assassin ni Traître. Tant qu'il en reste un, on joue.
 * - **Le Leader a perdu**, et son équipe avec lui, Gardiens survivants compris
 *   (907.8b). Alors :
 *   - s'il reste **au moins un Assassin en jeu**, les Assassins gagnent, tous,
 *     y compris ceux déjà éliminés (907.8c, 907.8e) ;
 *   - sinon les Assassins ont perdu eux aussi, et il ne reste que des Traîtres
 *     à pouvoir gagner. Un Traître gagne quand tous ses adversaires ont quitté
 *     la partie, **autres Traîtres compris** (907.8d) : avec un seul Traître en
 *     jeu c'est lui, avec deux la partie continue entre eux, avec aucun
 *     personne ne gagne.
 *
 * Les vainqueurs listés sont les sièges **encore assis** : `GAME_ENDED.winners`
 * désigne des sièges, et un joueur parti n'en a plus. L'équipe, elle, est dite
 * par `team`, et le journal nomme tout le monde.
 */
export function treacheryOutcome(state: GameState): TreacheryOutcome | null {
  const treachery = state.treachery;
  if (!treachery) return null;

  const all = [...treachery.identities.values()];
  const inGame = (identity: TreacheryIdentityState): boolean => {
    const seat = state.seats.get(identity.seat);
    return !identity.lost && seat !== undefined && !seat.conceded;
  };
  const alive = all.filter(inGame);
  const aliveOf = (role: TreacheryRole): TreacheryIdentityState[] =>
    alive.filter((i) => i.role === role);
  const seated = (identities: TreacheryIdentityState[]): SeatId[] =>
    identities.filter((i) => state.seats.has(i.seat)).map((i) => i.seat);

  if (aliveOf('LEADER').length > 0) {
    if (aliveOf('ASSASSIN').length > 0 || aliveOf('TRAITOR').length > 0) return null;
    return {
      team: 'LEADER',
      winners: seated(all.filter((i) => treacheryTeam(i.role) === 'LEADER')),
    };
  }

  if (aliveOf('ASSASSIN').length > 0) {
    return { team: 'ASSASSINS', winners: seated(all.filter((i) => i.role === 'ASSASSIN')) };
  }

  const traitors = aliveOf('TRAITOR');
  if (traitors.length > 1) return null;
  if (traitors.length === 1) return { team: 'TRAITOR', winners: seated(traitors) };
  return { team: null, winners: [] };
}

/**
 * Oublie les identités : la partie est relancée, on redistribuera au prochain
 * lancement. Rend l'event qui le dit aux clients, ou rien s'il n'y avait rien.
 */
export function clearIdentities(state: GameState): Emission[] {
  if (!state.treachery) return [];
  state.treachery = undefined;
  return [
    {
      audience: { kind: 'ALL' },
      build: () => ({ type: 'TREACHERY_SETUP', distribution: null }),
    },
  ];
}
