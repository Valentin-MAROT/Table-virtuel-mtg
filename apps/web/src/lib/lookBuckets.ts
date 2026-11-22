/**
 * Destinations d'une consultation de bibliothèque, selon le mode.
 *
 * Sans React ni store : ce que `LookModal` offre sous chaque carte se teste
 * seul (`test/destinations-consultation.test.ts`).
 */
import type { LookMode } from '@mtg/shared';

/** Valeurs du protocole (`RESOLVE_LOOK`) : elles ne changent jamais. */
export type Bucket = 'top' | 'bottom' | 'hand' | 'graveyard' | 'exile' | 'battlefield' | 'sideboard';

/**
 * Les destinations offertes **sous chaque carte**, selon ce qu'on consulte.
 *
 * Un scry ne demande qu'une chose : dessus ou dessous. Les boutons étaient
 * pourtant « Main » et « Champ » quel que soit le mode — ceux d'une fouille —
 * et « Dessous », le geste même du scry, dormait dans le menu « … ». Chaque
 * mode montre donc ses vraies destinations ; les autres restent dans le menu.
 */
export function quickBuckets(mode: LookMode | undefined): Bucket[] {
  switch (mode) {
    case 'SCRY':
      return ['top', 'bottom'];
    case 'SURVEIL':
      return ['top', 'graveyard'];
    case 'PEEK':
      return ['top', 'bottom', 'hand'];
    default:
      return ['hand', 'battlefield'];
  }
}

/** Le geste principal du mode : double-clic et flèche bas l'appliquent. */
export function primaryBucket(mode: LookMode | undefined): Bucket {
  if (mode === 'SCRY' || mode === 'PEEK') return 'bottom';
  if (mode === 'SURVEIL') return 'graveyard';
  return 'hand';
}

