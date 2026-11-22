/**
 * Étagère à jetons d'un deck.
 *
 * C'est une **palette d'impressions**, rangée avec le deck qui s'en sert : un
 * deck de gobelins n'a pas les mêmes jetons qu'un deck de trésors, et une
 * étagère commune à tous finissait en fourre-tout où l'on cherchait le bon
 * jeton parmi ceux des autres decks. Elle n'est toujours pas une zone de jeu —
 * aucun objet de partie n'y passe, et poser un jeton depuis l'étagère reste un
 * `CREATE_TOKEN` comme un autre.
 *
 * Ce module ne contient que ce que le serveur et le client doivent lire
 * pareil : la forme, le plafond, et la copie d'une étagère vers une autre.
 */

export interface ShelfToken {
  scryfallId: string;
  /** Le nom du catalogue, en anglais : c'est une clé, pas un affichage. */
  name: string;
}

/** Au-delà, ce n'est plus une étagère mais un catalogue. */
export const TOKEN_SHELF_MAX = 40;

/** Ne fait jamais confiance à ce qui sort d'un stockage, d'une base ou d'une API. */
export function sanitizeTokenShelf(value: unknown): ShelfToken[] {
  if (!Array.isArray(value)) return [];
  const items: ShelfToken[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const { scryfallId, name } = entry as Partial<ShelfToken>;
    if (typeof scryfallId !== 'string' || scryfallId.length === 0 || scryfallId.length > 64) continue;
    // Une impression n'a qu'une place : deux fois le même jeton ne sert à rien.
    if (seen.has(scryfallId)) continue;
    seen.add(scryfallId);
    items.push({ scryfallId, name: typeof name === 'string' && name ? name.slice(0, 200) : 'Jeton' });
    if (items.length === TOKEN_SHELF_MAX) break;
  }
  return items;
}

/**
 * Copie une étagère dans une autre : **ajoute ce qui manque, n'enlève rien**.
 *
 * Copier ne remplace pas. Le geste se fait en un clic, donc sans confirmation,
 * et un clic qui effacerait l'étagère qu'on vient de ranger serait un piège ;
 * ce qui est déjà là garde sa place et son ordre, les nouveaux jetons viennent
 * à la suite. `added` dit combien sont réellement entrés — zéro quand tout y
 * était déjà, ou quand le plafond est atteint.
 */
export function mergeTokenShelves(
  target: readonly ShelfToken[],
  source: readonly ShelfToken[],
): { items: ShelfToken[]; added: number } {
  const before = sanitizeTokenShelf(target);
  const items = sanitizeTokenShelf([...before, ...source]);
  return { items, added: items.length - before.length };
}
