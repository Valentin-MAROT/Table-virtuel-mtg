/**
 * Cache de métadonnées de cartes, côté client.
 *
 * Les images ne passent jamais par notre serveur : le navigateur va les chercher
 * sur le CDN de Scryfall, dont le motif d'URL est stable et dérivable de
 * l'identifiant. Seuls les noms et types viennent de notre API, par lots.
 */
import { api, type CardMeta } from './api.js';

/**
 * Dimensions de référence, relevées sur la table de référence : une carte en
 * main fait 166×230 px, soit le rapport 63×88 mm d'une vraie carte. Les autres
 * zones en dérivent par un facteur d'échelle. Elles vivent ici, et non dans un
 * composant, parce que le calcul de dépôt (`lib/drag.ts`) en a besoin lui aussi.
 */
export const CARD_WIDTH = 166;
export const CARD_HEIGHT = 230;
/** Facteur appliqué aux permanents : ~83×115, comme sur la table de référence. */
export const BATTLEFIELD_SCALE = 0.5;
/** Facteur des vignettes de pile (bibliothèque, cimetière, exil, commandement). */
export const PILE_SCALE = 0.42;

const cache = new Map<string, CardMeta>();
const inFlight = new Set<string>();
/**
 * Ce qui vient d'échouer et observe son repos.
 *
 * Sans lui, la boucle est immédiate et invisible : l'appel échoue, on prévient
 * les abonnés, ils re-rendent, ils redemandent la carte qui n'est toujours pas
 * en cache, et l'on repart — trente millisecondes plus tard, indéfiniment. Une
 * panne de quelques minutes de `/api/cards/batch` devient un martèlement de
 * notre propre API, par le navigateur de chaque joueur assis.
 *
 * C'est le même repos que celui de `lib/cardLocalization.ts`, qui l'a gagné en
 * fermant exactement cette boucle-là ; ce module en avait la structure sans en
 * avoir la garde. Dix secondes suffisent : le joueur voit « … » entre-temps,
 * ce qui est exactement ce qu'il verrait de toute façon.
 */
const cooling = new Set<string>();
const COOL_AFTER_ERROR = 10_000;
const listeners = new Set<() => void>();
let flushTimer: number | null = null;

export function subscribeCards(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Remise à zéro complète. N'existe que pour les tests. */
export function resetCardMeta(): void {
  cache.clear();
  inFlight.clear();
  cooling.clear();
  if (flushTimer !== null) window.clearTimeout(flushTimer);
  flushTimer = null;
}

export function cardMeta(scryfallId: string | undefined): CardMeta | undefined {
  if (!scryfallId) return undefined;
  const hit = cache.get(scryfallId);
  if (hit) return hit;
  requestCard(scryfallId);
  return undefined;
}

/**
 * Un identifiant Scryfall est un UUID. Le vérifier n'est pas de la paranoïa :
 * un seul identifiant d'objet (ULID) glissé dans un lot le fait rejeter en
 * bloc, et ce sont alors **tous** les noms de la frame qui manquent.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Demande différée : les identifiants vus dans la même frame partent ensemble. */
export function requestCard(scryfallId: string): void {
  if (!UUID.test(scryfallId)) return;
  if (cache.has(scryfallId) || inFlight.has(scryfallId) || cooling.has(scryfallId)) return;
  inFlight.add(scryfallId);
  schedule();
}

function schedule(): void {
  flushTimer ??= window.setTimeout(flush, 30);
}

function flush(): void {
  flushTimer = null;
  // 500 est le plafond de la route, pas une prudence : au-delà, le schéma
  // rejette le lot entier. Le reliquat repart donc au tour suivant.
  const ids = [...inFlight].slice(0, 500);
  if (ids.length === 0) return;

  let failed = false;
  void api
    .post<{ cards: CardMeta[] }>('/api/cards/batch', { ids })
    .then(({ cards }) => {
      for (const card of cards) cache.set(card.scryfallId, card);
    })
    .catch(() => {
      failed = true;
    })
    .finally(() => {
      for (const id of ids) inFlight.delete(id);
      if (failed) {
        for (const id of ids) cooling.add(id);
        window.setTimeout(() => {
          for (const id of ids) cooling.delete(id);
        }, COOL_AFTER_ERROR);
      }
      // Les abonnés sont prévenus même après un échec : ils re-rendent, et
      // c'est `cooling` — non le silence — qui empêche la redemande immédiate.
      for (const listener of listeners) listener();
      /*
       * Ce qui dépassait le plafond n'a encore rien demandé à personne. Sans
       * cette relance, il restait dans `inFlight` sans lot pour l'emporter, et
       * `requestCard` refusait de le reprogrammer puisqu'il l'y voyait déjà :
       * les cartes au-delà de la 500ᵉ s'affichaient « … » jusqu'à ce qu'un
       * identifiant neuf apparaisse par hasard et rouvre un lot.
       */
      if (inFlight.size > 0) schedule();
    });
}

/**
 * URL d'image Scryfall, dérivée de l'identifiant sans aucun appel réseau
 * préalable — c'est le motif que Scryfall publie dans `image_uris`.
 */
export function scryfallImage(
  scryfallId: string,
  version: 'small' | 'normal' | 'large' = 'large',
  face: 'front' | 'back' = 'front',
): string {
  const a = scryfallId[0] ?? '0';
  const b = scryfallId[1] ?? '0';
  return `https://cards.scryfall.io/${version}/${face}/${a}/${b}/${scryfallId}.jpg`;
}

/**
 * Dos de carte officiel, servi par le CDN de Scryfall.
 *
 * C'est une illustration de Wizards of the Coast, et nous l'affichons au même
 * titre que les 117 000 faces de cartes : leur politique de contenu de fan
 * autorise un projet non commercial à le faire, et le nôtre s'y déclare. La
 * règle que nous tenons est plus précise que « aucun asset » — elle est :
 * **ne rien héberger, ne rien proxifier, ne rien mettre en cache**. C'est le
 * navigateur du joueur qui va chercher l'image, directement, chez Scryfall.
 */
const CARD_BACK_ID = '0aeebaf5-8c7d-4636-9e82-8c27447861f7';

export function scryfallCardBack(version: 'small' | 'normal' | 'large' = 'normal'): string {
  const a = CARD_BACK_ID[0];
  const b = CARD_BACK_ID[1];
  // Note : les dos vivent sur `backs.scryfall.io`, pas sur `cards.scryfall.io`,
  // et le chemin n'a pas de segment de face. Vérifié : `cards.scryfall.io`
  // renvoie 404 pour cet identifiant.
  return `https://backs.scryfall.io/${version}/${a}/${b}/${CARD_BACK_ID}.jpg`;
}

export function cardName(scryfallId: string | undefined): string {
  if (!scryfallId) return 'Carte';
  return cardMeta(scryfallId)?.name ?? '…';
}

export function isDoubleFaced(meta: CardMeta | undefined): boolean {
  if (!meta) return false;
  return ['transform', 'modal_dfc', 'double_faced_token', 'reversible_card'].includes(meta.layout);
}
