/**
 * Le cache de métadonnées de cartes, après un échec réseau.
 *
 * Ce module et `lib/cardLocalization.ts` ont la même structure — un lot différé,
 * une erreur avalée, puis les abonnés prévenus — mais un seul des deux avait la
 * garde qui va avec. Sans elle, l'échec est une boucle : l'appel rate, on
 * prévient les abonnés, ils re-rendent, ils redemandent la carte qui n'est
 * toujours pas en cache, et l'on repart trente millisecondes plus tard. Une
 * panne de quelques minutes devient un martèlement de notre propre API, depuis
 * le navigateur de chaque joueur assis.
 *
 * Le second test couvre l'autre défaut du même bloc : 500 est le plafond de la
 * route, pas une prudence, et ce qui dépassait restait en vol sans lot pour
 * l'emporter.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** `window` n'existe pas en environnement node ; le module s'en sert pour ses minuteries. */
vi.stubGlobal('window', {
  setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms) as unknown as number,
  clearTimeout: (id: number) => clearTimeout(id as unknown as NodeJS.Timeout),
});

let reply: (ids: string[]) => unknown;
const post = vi.fn(async (_path: string, body: unknown) => reply((body as { ids: string[] }).ids));

vi.mock('../src/lib/api.js', () => ({
  api: { post: (path: string, body: unknown) => post(path, body) },
}));

const { cardMeta, resetCardMeta, subscribeCards } = await import('../src/lib/cards.js');

const id = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function meta(scryfallId: string): Record<string, unknown> {
  return {
    scryfallId,
    name: 'Lightning Bolt',
    setCode: 'lea',
    collectorNumber: '161',
    typeLine: 'Instant',
    manaCost: '{R}',
    colorIdentity: ['R'],
    layout: 'normal',
    imageUris: null,
    faces: null,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  resetCardMeta();
  post.mockClear();
  reply = (ids) => ({ cards: ids.map(meta) });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('repos après échec', () => {
  it('ne rappelle pas l’API tant que le repos court, même relancé par ses abonnés', async () => {
    // L'abonné fait exactement ce qu'un composant monté fait : il re-rend, donc
    // il redemande la carte qu'il n'a toujours pas. C'est lui la boucle.
    const unsubscribe = subscribeCards(() => void cardMeta(id(1)));
    reply = () => {
      throw new Error('502');
    };

    cardMeta(id(1));
    await vi.advanceTimersByTimeAsync(30);
    expect(post).toHaveBeenCalledTimes(1);

    // Dix secondes de sollicitation continue : sans le repos, c'est un appel
    // toutes les trente millisecondes, soit plus de trois cents.
    for (let i = 0; i < 100; i++) {
      cardMeta(id(1));
      await vi.advanceTimersByTimeAsync(99);
    }
    expect(post).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('reprend la carte une fois le repos écoulé', async () => {
    reply = () => {
      throw new Error('502');
    };
    cardMeta(id(1));
    await vi.advanceTimersByTimeAsync(30);
    expect(post).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    reply = (ids) => ({ cards: ids.map(meta) });
    cardMeta(id(1));
    await vi.advanceTimersByTimeAsync(30);

    expect(post).toHaveBeenCalledTimes(2);
    expect(cardMeta(id(1))?.name).toBe('Lightning Bolt');
  });
});

describe('plafond de la route', () => {
  it('sert le reliquat au-delà de 500 sans attendre un identifiant neuf', async () => {
    const asked = new Set<string>();
    reply = (ids) => {
      expect(ids.length).toBeLessThanOrEqual(500);
      for (const one of ids) asked.add(one);
      return { cards: ids.map(meta) };
    };

    // 700 cartes dans la même frame : deux lots, et le second ne doit pas
    // dépendre de l'arrivée fortuite d'une 701ᵉ carte pour partir.
    for (let n = 0; n < 700; n++) cardMeta(id(n));
    await vi.advanceTimersByTimeAsync(30);
    expect(post).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30);
    expect(post).toHaveBeenCalledTimes(2);
    expect(asked.size).toBe(700);
    expect(cardMeta(id(699))?.name).toBe('Lightning Bolt');
  });
});
