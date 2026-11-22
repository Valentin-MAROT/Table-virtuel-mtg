/**
 * L'étagère à jetons appartient à un deck.
 *
 * Elle était commune à tout le compte ; elle est maintenant rangée avec le deck
 * enregistré, et se copie d'un deck à l'autre en un clic. Trois promesses sont
 * gardées ici : on retrouve le bon deck pour une table, copier n'efface jamais
 * rien, et l'on ne propose pas une copie qui n'apporterait aucun jeton.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeckSummary } from '@mtg/shared';
import { TOKEN_SHELF_MAX, mergeTokenShelves, sanitizeTokenShelf } from '@mtg/shared';

const store = new Map<string, string>();
vi.stubGlobal('window', {
  localStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  },
});

const { readShelf, rememberSeatDeck, resolveShelfScope, saveShelf, shelfSources } = await import(
  '../src/lib/shelf.js'
);

const token = (n: number) => ({ scryfallId: `id-${n}`, name: `Jeton ${n}` });
const deck = (id: string, name: string, tokens: number[] = []): DeckSummary =>
  ({ id, name, tokenShelf: tokens.map(token) }) as DeckSummary;

beforeEach(() => store.clear());

describe('forme de l’étagère', () => {
  it('écarte ce qui n’est pas un jeton, et les doublons', () => {
    const clean = sanitizeTokenShelf([token(1), null, 'x', { scryfallId: '' }, token(1), { scryfallId: 'id-2' }]);
    expect(clean).toEqual([token(1), { scryfallId: 'id-2', name: 'Jeton' }]);
  });

  it('ne dépasse jamais le plafond', () => {
    const many = Array.from({ length: TOKEN_SHELF_MAX + 15 }, (_, i) => token(i));
    expect(sanitizeTokenShelf(many)).toHaveLength(TOKEN_SHELF_MAX);
  });

  it('rend une étagère vide pour une valeur absente', () => {
    expect(sanitizeTokenShelf(null)).toEqual([]);
    expect(sanitizeTokenShelf(undefined)).toEqual([]);
  });
});

describe('copie d’une étagère', () => {
  it('ajoute ce qui manque à la suite, sans rien retirer ni réordonner', () => {
    const merged = mergeTokenShelves([token(3), token(1)], [token(1), token(2)]);
    expect(merged.items).toEqual([token(3), token(1), token(2)]);
    expect(merged.added).toBe(1);
  });

  it('n’ajoute rien quand tout y est déjà', () => {
    expect(mergeTokenShelves([token(1), token(2)], [token(2)]).added).toBe(0);
  });

  it('s’arrête au plafond, et le dit', () => {
    const full = Array.from({ length: TOKEN_SHELF_MAX - 1 }, (_, i) => token(i));
    const merged = mergeTokenShelves(full, [token(100), token(101)]);
    expect(merged.items).toHaveLength(TOKEN_SHELF_MAX);
    expect(merged.added).toBe(1);
  });
});

describe('à quel deck la table est attachée', () => {
  const decks = [deck('a', 'Gobelins', [1]), deck('b', 'Trésors', [2]), deck('c', 'Trésors')];

  it('prend le deck noté au moment de s’asseoir', () => {
    rememberSeatDeck('TABLE1', 'c');
    expect(resolveShelfScope('TABLE1', 'Trésors', decks)).toEqual({
      kind: 'DECK',
      deckId: 'c',
      deckName: 'Trésors',
    });
  });

  it('retrouve le deck par son nom quand rien n’a été noté et qu’il est seul de ce nom', () => {
    expect(resolveShelfScope('TABLE1', 'Gobelins', decks)).toMatchObject({ kind: 'DECK', deckId: 'a' });
  });

  it('ne choisit pas entre deux decks homonymes', () => {
    expect(resolveShelfScope('TABLE1', 'Trésors', decks)).toEqual({ kind: 'TABLE', roomCode: 'TABLE1' });
  });

  it('retombe sur l’étagère de la table pour une liste collée', () => {
    rememberSeatDeck('TABLE1', 'a');
    rememberSeatDeck('TABLE1', null);
    expect(resolveShelfScope('TABLE1', 'Deck collé', decks)).toEqual({ kind: 'TABLE', roomCode: 'TABLE1' });
  });

  it('ignore un deck noté dont le nom n’est plus celui du siège', () => {
    rememberSeatDeck('TABLE1', 'a');
    expect(resolveShelfScope('TABLE1', 'Deck collé', decks).kind).toBe('TABLE');
  });

  it('ignore un deck noté qui a été supprimé', () => {
    rememberSeatDeck('TABLE1', 'disparu');
    expect(resolveShelfScope('TABLE1', 'Deck collé', decks).kind).toBe('TABLE');
  });

  it('ne mélange pas les étagères de deux tables', async () => {
    await saveShelf({ kind: 'TABLE', roomCode: 'TABLE1' }, [token(1)]);
    expect(readShelf({ kind: 'TABLE', roomCode: 'TABLE1' }, [])).toEqual([token(1)]);
    expect(readShelf({ kind: 'TABLE', roomCode: 'TABLE2' }, [])).toEqual([]);
  });

  it('lit l’étagère du deck, pas celle d’un autre', () => {
    expect(readShelf({ kind: 'DECK', deckId: 'b', deckName: 'Trésors' }, decks)).toEqual([token(2)]);
  });
});

describe('sources de copie', () => {
  const decks = [deck('a', 'Gobelins', [1, 2]), deck('b', 'Trésors', [2]), deck('c', 'Vide')];

  it('propose les autres decks qui apportent un jeton, jamais le deck lui-même', () => {
    const sources = shelfSources(decks, [], { deckId: 'b', items: [token(2)] }, 'Ancienne');
    expect(sources.map((s) => s.id)).toEqual(['a']);
  });

  it('ne propose ni une étagère vide, ni une étagère déjà contenue', () => {
    const sources = shelfSources(decks, [], { deckId: 'a', items: [token(1), token(2)] }, 'Ancienne');
    expect(sources).toEqual([]);
  });

  it('propose l’ancienne étagère commune comme une source parmi les autres', () => {
    const sources = shelfSources(decks, [token(9)], { deckId: 'c', items: [] }, 'Ancienne');
    expect(sources.map((s) => s.id)).toEqual(['a', 'b', 'legacy']);
    expect(sources.at(-1)).toMatchObject({ name: 'Ancienne', legacy: true });
  });

  it('sert aussi une étagère de table, qui n’a pas de deck', () => {
    const sources = shelfSources(decks, [], { deckId: null, items: [] }, 'Ancienne');
    expect(sources.map((s) => s.id)).toEqual(['a', 'b']);
  });
});
