/**
 * Étagère à jetons.
 *
 * C'est une **palette, pas une zone de jeu** : elle ne contient aucun objet de
 * partie, seulement des identifiants d'impression. Rien n'y est caché, rien n'y
 * est arbitré, et le serveur n'en sait rien — poser un jeton depuis l'étagère
 * revient exactement à `CREATE_TOKEN`, comme la recherche de jetons.
 *
 * Persistance : `UserPrefs.extra` pour un compte, `localStorage` pour un
 * invité. Le mode invité reste entier — l'étagère marche sans compte, elle ne
 * suit simplement pas le joueur d'un navigateur à l'autre.
 *
 * **Le côté compte passe par `lib/accountExtra.ts` et non plus par sa propre
 * plomberie.** Ce module tenait son instantané du compte, relisait
 * `prefs.extra` dedans et le renvoyait fusionné — ce qui suffisait tant qu'il
 * était seul à écrire là. La disposition des terrains (`lib/landLayout.ts`) y
 * vit désormais aussi : deux instantanés séparés se seraient effacés l'un
 * l'autre au premier enregistrement, `PATCH /api/me` remplaçant `extra` en
 * entier. Le joueur aurait rangé son étagère, choisi une disposition, et
 * retrouvé l'étagère vide au rechargement — sans que rien n'ait échoué.
 */
import { hasAccount, readAccountExtra, writeAccountExtra } from './accountExtra.js';

export interface ShelfToken {
  scryfallId: string;
  name: string;
}

const STORAGE_KEY = 'mtg.tokenShelf';
/** La clé sous laquelle l'étagère vit dans `UserPrefs.extra`. */
const EXTRA_KEY = 'tokenShelf';
const MAX_ITEMS = 40;

function readLocal(): ShelfToken[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return sanitize(parsed);
  } catch {
    return [];
  }
}

function writeLocal(items: ShelfToken[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Stockage refusé (navigation privée) : l'étagère vit le temps de la page.
  }
}

/** Ne fait jamais confiance à ce qui sort d'un stockage ou d'une API. */
function sanitize(value: unknown): ShelfToken[] {
  if (!Array.isArray(value)) return [];
  const items: ShelfToken[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const { scryfallId, name } = entry as Partial<ShelfToken>;
    if (typeof scryfallId !== 'string' || scryfallId.length === 0) continue;
    items.push({ scryfallId, name: typeof name === 'string' ? name : 'Jeton' });
  }
  return items.slice(0, MAX_ITEMS);
}

/**
 * Charge l'étagère. Un compte l'emporte sur le stockage local ; s'il n'a rien,
 * on reprend ce qui traînait localement, ce qui évite de perdre l'étagère d'un
 * invité qui vient de se créer un compte.
 */
export async function loadShelf(): Promise<ShelfToken[]> {
  const stored = sanitize(await readAccountExtra(EXTRA_KEY));
  if (stored.length > 0) return stored;

  const local = readLocal();
  // `hasAccount()` ne répond juste qu'après le `readAccountExtra` ci-dessus,
  // qui est ce qui va chercher le compte : l'ordre des deux lignes compte.
  if (local.length > 0 && hasAccount()) await saveShelf(local);
  return local;
}

/** Enregistre l'étagère, là où ce joueur-là la garde. Ne lève jamais. */
export async function saveShelf(items: ShelfToken[]): Promise<void> {
  const trimmed = items.slice(0, MAX_ITEMS);
  writeLocal(trimmed);
  await writeAccountExtra(EXTRA_KEY, trimmed);
}
