/**
 * Étagère à jetons.
 *
 * C'est une **palette, pas une zone de jeu** : elle ne contient aucun objet de
 * partie, seulement des identifiants d'impression. Rien n'y est caché, rien n'y
 * est arbitré, et le serveur de jeu n'en sait rien — poser un jeton depuis
 * l'étagère revient exactement à `CREATE_TOKEN`, comme la recherche de jetons.
 *
 * **Elle appartient à un deck, et à lui seul.** Elle vivait dans les
 * préférences du compte, donc commune à tous les decks : les gobelins d'un
 * deck traînaient à côté des trésors d'un autre, et l'on rangeait puis
 * retirait les mêmes jetons d'une partie à la suivante. Elle est maintenant
 * une donnée du deck enregistré (`Deck.tokenShelf`, écrite par
 * `PUT /api/decks/:id/token-shelf`) et suit le deck d'un navigateur à l'autre.
 *
 * Deux cas n'ont pas de deck enregistré auquel l'attacher — un invité, et une
 * liste collée à la table. L'étagère y est celle **de cette table** : gardée
 * dans le navigateur sous le code de la table, elle ne déborde sur aucune
 * autre partie. Le mode invité reste donc entier, il ne garde simplement rien
 * d'une table à la suivante ; c'est exactement ce que veut dire « collé ».
 *
 * **L'ancienne étagère n'est pas perdue.** Celle du compte (ou du navigateur)
 * reste lisible, en lecture seule, et se propose comme source de copie au même
 * titre que l'étagère d'un autre deck (`shelfSources`). On ne la répartit pas
 * d'office entre les decks : personne ne sait mieux que le joueur quel jeton
 * va avec quel deck.
 */
import {
  mergeTokenShelves,
  sanitizeTokenShelf,
  type DeckSummary,
  type ShelfToken,
} from '@mtg/shared';
import { api } from './api.js';
import { readAccountExtra } from './accountExtra.js';

export type { ShelfToken };

/** À quoi l'étagère affichée est attachée. */
export type ShelfScope =
  | { kind: 'DECK'; deckId: string; deckName: string }
  /** Invité ou liste collée : l'étagère de cette table, dans ce navigateur. */
  | { kind: 'TABLE'; roomCode: string };

/** Une étagère qu'on peut copier dans la sienne. */
export interface ShelfSource {
  /** Identifiant du deck, ou `legacy` pour l'ancienne étagère commune. */
  id: string;
  name: string;
  items: ShelfToken[];
  legacy: boolean;
}

/** L'ancienne étagère commune : clé du navigateur, et clé de `UserPrefs.extra`. */
const LEGACY_STORAGE_KEY = 'mtg.tokenShelf';
const LEGACY_EXTRA_KEY = 'tokenShelf';
const TABLE_STORAGE_PREFIX = 'mtg.tokenShelf.table.';
const SEAT_DECK_PREFIX = 'mtg.seatDeck.';

function readStorage(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Stockage refusé (navigation privée) : l'étagère vit le temps de la page.
  }
}

/**
 * Le deck enregistré qu'on a chargé à cette table.
 *
 * Le protocole ne dit à personne de quel deck enregistré vient un siège —
 * `DECK_LOADED` porte un nom, public, et rien d'autre — et il n'a pas à le
 * dire : c'est le client qui a choisi le deck, il lui suffit de s'en souvenir.
 * On le note au moment d'envoyer `SIT_DOWN` ou `LOAD_DECK`, sous le code de la
 * table, pour qu'un rechargement de page retrouve la même étagère. `null`
 * efface : on vient de coller une liste.
 */
export function rememberSeatDeck(roomCode: string, deckId: string | null): void {
  writeStorage(SEAT_DECK_PREFIX + roomCode, deckId);
}

function rememberedSeatDeck(roomCode: string): string | null {
  const value = readStorage(SEAT_DECK_PREFIX + roomCode);
  return typeof value === 'string' && value ? value : null;
}

/** Les decks du compte ; vide pour un invité. Ne lève jamais. */
export async function fetchDecks(): Promise<DeckSummary[]> {
  try {
    const { decks } = await api.get<{ decks: DeckSummary[] }>('/api/decks');
    return decks;
  } catch {
    return [];
  }
}

/**
 * À quoi attacher l'étagère de cette table.
 *
 * Le deck noté au chargement fait foi tant qu'il existe encore et que son nom
 * est bien celui que la table annonce pour ce siège. À défaut — partie reprise
 * depuis un autre navigateur — on retrouve le deck par son nom, **s'il n'y en
 * a qu'un** de ce nom : deux decks homonymes ne se départagent pas, et choisir
 * au hasard rangerait des jetons dans le mauvais. Sinon, l'étagère est celle
 * de la table.
 */
export function resolveShelfScope(
  roomCode: string,
  seatDeckName: string | null,
  decks: readonly DeckSummary[],
): ShelfScope {
  const remembered = rememberedSeatDeck(roomCode);
  const noted = decks.find((deck) => deck.id === remembered);
  if (noted && (seatDeckName === null || noted.name === seatDeckName)) {
    return { kind: 'DECK', deckId: noted.id, deckName: noted.name };
  }
  if (seatDeckName !== null && remembered === null) {
    const sameName = decks.filter((deck) => deck.name === seatDeckName);
    if (sameName.length === 1) {
      return { kind: 'DECK', deckId: sameName[0]!.id, deckName: sameName[0]!.name };
    }
  }
  return { kind: 'TABLE', roomCode };
}

/** L'étagère de ce périmètre, lue dans la liste des decks déjà chargée. */
export function readShelf(scope: ShelfScope, decks: readonly DeckSummary[]): ShelfToken[] {
  if (scope.kind === 'DECK') {
    return sanitizeTokenShelf(decks.find((deck) => deck.id === scope.deckId)?.tokenShelf);
  }
  return sanitizeTokenShelf(readStorage(TABLE_STORAGE_PREFIX + scope.roomCode));
}

/**
 * Enregistre l'étagère, là où ce périmètre la garde. Rend ce qui a été gardé,
 * ou `null` si l'écriture a échoué — l'appelant garde alors son affichage, et
 * le dit.
 */
export async function saveShelf(
  scope: ShelfScope,
  items: readonly ShelfToken[],
): Promise<ShelfToken[] | null> {
  const clean = sanitizeTokenShelf(items);
  if (scope.kind === 'TABLE') {
    writeStorage(TABLE_STORAGE_PREFIX + scope.roomCode, clean);
    return clean;
  }
  return saveDeckShelf(scope.deckId, clean);
}

/** Écrit l'étagère d'un deck enregistré. `null` si le serveur a refusé. */
export async function saveDeckShelf(
  deckId: string,
  items: readonly ShelfToken[],
): Promise<ShelfToken[] | null> {
  try {
    const saved = await api.put<{ items: ShelfToken[] }>(`/api/decks/${deckId}/token-shelf`, {
      items: sanitizeTokenShelf(items),
    });
    return sanitizeTokenShelf(saved.items);
  } catch {
    return null;
  }
}

/** L'ancienne étagère commune : celle du compte, sinon celle du navigateur. */
export async function loadLegacyShelf(): Promise<ShelfToken[]> {
  const stored = sanitizeTokenShelf(await readAccountExtra(LEGACY_EXTRA_KEY));
  return stored.length > 0 ? stored : sanitizeTokenShelf(readStorage(LEGACY_STORAGE_KEY));
}

/**
 * Les étagères qu'on peut copier : celles des **autres** decks, puis
 * l'ancienne étagère commune. Les vides n'y figurent pas — il n'y a rien à en
 * copier — ni celles qui n'apporteraient aucun jeton nouveau.
 */
export function shelfSources(
  decks: readonly DeckSummary[],
  legacy: readonly ShelfToken[],
  target: { deckId: string | null; items: readonly ShelfToken[] },
  legacyName: string,
): ShelfSource[] {
  const sources: ShelfSource[] = decks
    .filter((deck) => deck.id !== target.deckId)
    .map((deck) => ({
      id: deck.id,
      name: deck.name,
      items: sanitizeTokenShelf(deck.tokenShelf),
      legacy: false,
    }));
  sources.push({ id: 'legacy', name: legacyName, items: sanitizeTokenShelf(legacy), legacy: true });
  return sources.filter((source) => mergeTokenShelves(target.items, source.items).added > 0);
}

export { mergeTokenShelves };
