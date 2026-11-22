/**
 * Treachery : la variante à rôles cachés, selon ses règles officielles
 * (https://mtgtreachery.net/rules/cr/, règles 907 et 702.TR01).
 *
 * Ce module ne contient que ce que **les deux côtés** doivent lire pareil : les
 * rôles, la répartition par nombre de joueurs, les bornes de la table. Ce qui
 * décide — distribution, dévoilement, victoire — vit sur le serveur
 * (`apps/server/src/game/treachery.ts`), et nulle part ailleurs.
 */
import type { GameMode, SeatId } from '../protocol/core.js';

export const TREACHERY_ROLES = ['LEADER', 'GUARDIAN', 'ASSASSIN', 'TRAITOR'] as const;
export type TreacheryRole = (typeof TREACHERY_ROLES)[number];

/**
 * Les équipes (907.5) : le Leader et ses Gardiens, les Assassins ensemble, et
 * chaque Traître **seul** — deux Traîtres ne sont pas alliés.
 */
export type TreacheryTeam = 'LEADER' | 'ASSASSINS' | 'TRAITOR';

export function treacheryTeam(role: TreacheryRole): TreacheryTeam {
  if (role === 'ASSASSIN') return 'ASSASSINS';
  if (role === 'TRAITOR') return 'TRAITOR';
  return 'LEADER';
}

export type TreacheryDistribution = Record<TreacheryRole, number>;

/** De quatre à huit joueurs (907.2, 907.3c). */
export const TREACHERY_MIN_SEATS = 4;
export const TREACHERY_MAX_SEATS = 8;

/**
 * Répartition recommandée par les règles (907.3c). Elle est **publique** : tout
 * le monde sait combien d'Assassins sont à la table (907.3d), et c'est ce qui
 * permet de raisonner sur qui est qui.
 *
 * `null` hors de la plage jouable.
 */
export function treacheryDistribution(players: number): TreacheryDistribution | null {
  switch (players) {
    case 4:
      return { LEADER: 1, GUARDIAN: 0, ASSASSIN: 2, TRAITOR: 1 };
    case 5:
      return { LEADER: 1, GUARDIAN: 1, ASSASSIN: 2, TRAITOR: 1 };
    case 6:
      return { LEADER: 1, GUARDIAN: 1, ASSASSIN: 3, TRAITOR: 1 };
    case 7:
      return { LEADER: 1, GUARDIAN: 2, ASSASSIN: 3, TRAITOR: 1 };
    case 8:
      return { LEADER: 1, GUARDIAN: 2, ASSASSIN: 3, TRAITOR: 2 };
    default:
      return null;
  }
}

/**
 * Nombre de sièges qu'une table accepte, **selon son mode**.
 *
 * Le plafond de quatre est une décision de produit (la partie de Commander à
 * quatre) ; Treachery ne se joue vraiment qu'à cinq ou six et va jusqu'à huit.
 * Le plafond est donc celui du mode, et la disposition des panneaux suit — les
 * deux ont été revus ensemble, comme le demandait la note qui les liait.
 */
export function seatCap(mode: GameMode): number {
  return mode === 'TREACHERY' ? TREACHERY_MAX_SEATS : 4;
}

/**
 * Ce qu'un siège a le droit de savoir de l'identité d'un autre — ou de la
 * sienne.
 *
 * Il n'existe **pas** de vue « cachée » d'une identité : une identité que le
 * destinataire n'a pas le droit de connaître n'est simplement pas envoyée. Son
 * absence ne dit rien que la table ne sache déjà — chaque joueur a une carte
 * d'identité, c'est la règle du jeu.
 */
export interface TreacheryIdentityView {
  seat: SeatId;
  /** Le nom du joueur, conservé pour un siège qui a quitté la table (907.12). */
  displayName: string;
  role: TreacheryRole;
  /** Numéro de la carte d'identité, voir `TREACHERY_IDENTITIES`. */
  cardId: number;
  /**
   * La carte est face visible : toute la table la voit. `false` ne se
   * rencontre que sur **sa propre** identité, encore secrète.
   */
  unveiled: boolean;
}

export interface TreacheryOutcome {
  /** `null` : plus personne ne peut gagner, la partie s'arrête sans vainqueur. */
  team: TreacheryTeam | null;
  winners: SeatId[];
}
