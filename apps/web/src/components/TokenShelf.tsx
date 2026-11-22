/**
 * Étagère à jetons : une palette d'impressions, pas une zone de jeu.
 *
 * Cliquer un jeton en pose un sur son propre champ de bataille ; le glisser
 * permet de choisir l'endroit. Dans les deux cas, un seul intent part :
 * `CREATE_TOKEN`. L'étagère elle-même ne contient aucun objet de partie, et le
 * serveur ignore jusqu'à son existence.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DeckSummary } from '@mtg/shared';
import { useGame } from '../store/game.js';
import { scryfallImage } from '../lib/cards.js';
import { localizedCard, localizedCardName, useLocalizationTick } from '../lib/cardLocalization.js';
import { resolveCardImage, tokenName, useT } from '../lib/i18n/index.js';
import { useLanguage } from '../store/prefs.js';
import { findDropTarget } from '../lib/drag.js';
import {
  fetchDecks,
  loadLegacyShelf,
  mergeTokenShelves,
  readShelf,
  resolveShelfScope,
  saveShelf,
  shelfSources,
  type ShelfScope,
  type ShelfSource,
  type ShelfToken,
} from '../lib/shelf.js';
import { TokenNameBand } from './TokenNameBand.js';

/** Position de repli quand on clique sans viser. */
const DEFAULT_DROP = { x: 60, y: 60 };

/**
 * L'étagère montée, vue de l'extérieur du composant : le menu contextuel d'un
 * jeton y range une impression, et le salon la fait relire quand on vient de
 * charger un autre deck.
 */
let mounted: {
  add: (token: ShelfToken) => Promise<boolean>;
  reload: () => void;
} | null = null;

/**
 * Ajoute un jeton à l'étagère depuis ailleurs (le menu contextuel d'un jeton).
 * Renvoie `false` si l'impression y était déjà.
 */
export async function shelveToken(token: ShelfToken): Promise<boolean> {
  return mounted ? mounted.add(token) : false;
}

/** Le deck du siège vient de changer : l'étagère est à relire. */
export function reloadTokenShelf(): void {
  mounted?.reload();
}

export function TokenShelf({ onSearch }: { onSearch: () => void }): React.ReactElement | null {
  const t = useT();
  const send = useGame((s) => s.send);
  const hoverPreview = useGame((s) => s.hoverPreview);
  const mySeat = useGame((s) => s.mySeat);
  const roomCode = useGame((s) => s.roomCode);
  /** Le nom du deck que la table annonce pour notre siège. */
  const deckName = useGame((s) => s.seats.find((seat) => seat.id === s.mySeat)?.deckName ?? null);
  const viewScale = useGame((s) => s.viewScale);
  const [items, setItems] = useState<ShelfToken[] | null>(null);
  const [scope, setScope] = useState<ShelfScope | null>(null);
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [legacy, setLegacy] = useState<ShelfToken[]>([]);
  const [open, setOpen] = useState(true);
  /** La fenêtre qui liste les étagères à copier est ouverte. */
  const [copying, setCopying] = useState(false);
  /** Ce que le dernier geste a donné : « 3 jetons ajoutés », ou un échec d'écriture. */
  const [notice, setNotice] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  /*
   * L'étagère ne garde qu'un identifiant et le nom du catalogue — c'est lui qui
   * distingue deux impressions dans le stockage, et il n'a pas à bouger avec la
   * langue. Seuls la vignette et l'infobulle passent au français.
   *
   * C'est exactement pourquoi le glossaire des jetons ne s'applique qu'au
   * **rendu** : `token.name`, tel que `saveShelf` l'écrit, reste anglais. Y
   * figer « Soldat » rendrait l'étagère illisible au premier passage en anglais,
   * et un doublon invisible au suivant.
   */
  useLocalizationTick();
  const language = useLanguage();

  /*
   * L'étagère est celle **du deck chargé à ce siège** : on la relit dès que la
   * table annonce un autre deck pour nous (`deckName`), et quand le salon nous
   * dit qu'on vient d'en choisir un (`reloadTokenShelf`) — deux decks peuvent
   * porter le même nom, et le nom seul ne bougerait pas.
   */
  useEffect(() => {
    if (!roomCode) return;
    let alive = true;
    void Promise.all([fetchDecks(), loadLegacyShelf()]).then(([list, old]) => {
      if (!alive) return;
      const next = resolveShelfScope(roomCode, deckName, list);
      setDecks(list);
      setLegacy(old);
      setScope(next);
      setItems(readShelf(next, list));
      setCopying(false);
      setNotice(null);
    });
    return () => {
      alive = false;
    };
  }, [roomCode, deckName, reloads]);

  /** Écrit l'étagère : l'affichage d'abord, le stockage ensuite. */
  async function commit(next: ShelfToken[]): Promise<void> {
    if (!scope) return;
    setItems(next);
    const saved = await saveShelf(scope, next);
    if (saved === null) return setNotice(t('shelf.saveFailed'));
    // La liste des decks sert de source aux copies : elle doit suivre.
    if (scope.kind === 'DECK') {
      setDecks((list) =>
        list.map((deck) => (deck.id === scope.deckId ? { ...deck, tokenShelf: saved } : deck)),
      );
    }
  }

  /*
   * Ce que l'extérieur peut demander à l'étagère montée. La référence est
   * rafraîchie à chaque rendu : `add` doit lire l'étagère **courante**, pas
   * celle du rendu où l'effet a été posé.
   */
  const latest = useRef({ items, commit });
  latest.current = { items, commit };
  useEffect(() => {
    const handle = {
      add: async (token: ShelfToken): Promise<boolean> => {
        const current = latest.current.items;
        if (!current || current.some((item) => item.scryfallId === token.scryfallId)) return false;
        await latest.current.commit([...current, token]);
        return true;
      },
      reload: () => setReloads((n) => n + 1),
    };
    mounted = handle;
    return () => {
      if (mounted === handle) mounted = null;
    };
  }, []);

  // L'étagère peut disparaître sous le curseur (on quitte la table) : l'aperçu
  // qu'elle a armé ne doit pas lui survivre.
  useEffect(() => () => hoverPreview(null), [hoverPreview]);

  if (!mySeat || items === null || scope === null) return null;

  /** Les étagères qui apporteraient quelque chose à la nôtre. */
  const sources = shelfSources(
    decks,
    legacy,
    { deckId: scope.kind === 'DECK' ? scope.deckId : null, items },
    t('shelf.legacy'),
  );

  /** Copie en un clic : ce qui manque est ajouté, rien n'est retiré. */
  async function copyFrom(source: ShelfSource): Promise<void> {
    const merged = mergeTokenShelves(items!, source.items);
    await commit(merged.items);
    setCopying(false);
    setNotice(t('shelf.copied', { count: merged.added }));
  }


  function create(token: ShelfToken, at: { x: number; y: number }): void {
    send({ type: 'CREATE_TOKEN', scryfallId: token.scryfallId, x: at.x, y: at.y });
  }

  /**
   * Glissement depuis l'étagère. On ne passe pas par la couche de glissement de
   * la table : il n'y a pas d'objet de jeu à traîner, seulement une intention de
   * création. On ne crée que sur **son propre** champ de bataille, puisque les
   * coordonnées d'un `CREATE_TOKEN` sont celles du siège qui le demande.
   */
  function onItemPointerDown(token: ShelfToken, event: React.PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    const origin = { x: event.clientX, y: event.clientY };

    const up = (e: PointerEvent): void => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);

      const moved = Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 4;
      if (!moved) return create(token, DEFAULT_DROP);

      const target = findDropTarget(e.clientX, e.clientY, viewScale);
      if (!target || target.zone.kind !== 'BATTLEFIELD' || target.zone.seat !== mySeat) return;
      create(token, { x: target.x, y: target.y });
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /**
   * Déplace un jeton d'un cran dans l'étagère.
   *
   * Deux flèches, et non un glisser-déposer : **le glissement est déjà pris**
   * — il sert à poser le jeton sur la table, ce qui est le geste courant. Lui
   * superposer un réordonnancement obligerait à distinguer les deux à la
   * distance ou à la direction, et l'on se tromperait une fois sur deux. Les
   * flèches n'apparaissent qu'au survol, comme la croix de retrait.
   */
  async function move(scryfallId: string, direction: -1 | 1): Promise<void> {
    const list = [...items!];
    const from = list.findIndex((item) => item.scryfallId === scryfallId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= list.length) return;
    [list[from], list[to]] = [list[to]!, list[from]!];
    await commit(list);
  }

  async function remove(scryfallId: string): Promise<void> {
    const next = items!.filter((item) => item.scryfallId !== scryfallId);
    await commit(next);
  }

  return (
    <div
      className="pointer-events-auto w-60 rounded-xl border border-slate-700 bg-slate-900/90 text-sm shadow-xl backdrop-blur-md overflow-hidden"
      data-test="token-shelf"
    >
      <header className="flex items-center justify-between gap-2 border-b border-slate-800/90 px-3.5 py-2 text-xs bg-slate-950/40">
        <button className="font-bold uppercase tracking-wider text-slate-300 text-[10px] hover:text-white transition-colors flex items-center gap-1.5" onClick={() => setOpen((v) => !v)}>
          <span>{t('shelf.title')}</span>
          <span className="text-slate-400 text-xs">{open ? '▾' : '▸'}</span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button
            className="rounded-md bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-white px-2 py-0.5 text-xs font-bold border border-slate-700 transition-colors"
            onClick={onSearch}
            data-test="token-search"
            title="Chercher un jeton (+)"
          >
            +
          </button>
        </div>
      </header>

      {open && (
        <div className="grid grid-cols-3 gap-2 p-2.5">
          {/*
            À quoi cette étagère est attachée. C'est la première chose à dire :
            elle change avec le deck, et une étagère qui se vide « toute seule »
            quand on change de deck doit dire pourquoi.
          */}
          <p
            className="col-span-3 truncate text-[11px] text-slate-400"
            data-scope={scope.kind}
            data-test="shelf-scope"
            title={scope.kind === 'DECK' ? scope.deckName : t('shelf.ofTableHint')}
          >
            {scope.kind === 'DECK' ? t('shelf.ofDeck', { name: scope.deckName }) : t('shelf.ofTable')}
          </p>
          {notice && (
            <p className="col-span-3 text-[11px] text-sky-300" data-test="shelf-notice">
              {notice}
            </p>
          )}
          {items.length === 0 && (
            <p className="col-span-3 py-1 text-center text-[11px] text-slate-500">
              {t('shelf.empty')}
            </p>
          )}
          {/*
            Copier l'étagère d'un autre deck : **un bouton, et rien d'autre
            ici**. La liste des étagères s'ouvre dans sa fenêtre, où elle a la
            place de montrer ce que chacune contient — dans les 240 px de cette
            colonne, elle poussait les jetons hors de vue. Le bouton n'existe
            que s'il y a quelque chose à copier.
          */}
          {sources.length > 0 && (
            <button
              aria-haspopup="dialog"
              className="col-span-3 rounded-md border border-slate-700 bg-slate-800/70 px-2 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-sky-600 hover:bg-slate-700/70 hover:text-white"
              data-test="shelf-copy"
              onClick={() => setCopying(true)}
              type="button"
            >
              {t('shelf.copy')}
            </button>
          )}
          {items.map((token, index) => {
            const localized = localizedCard(token.scryfallId, language);
            const src =
              resolveCardImage({
                card: { scryfallId: token.scryfallId },
                localized,
                language,
                version: 'normal',
              }).url ?? scryfallImage(token.scryfallId, 'normal');
            const shownName =
              tokenName(localizedCardName(localized, token.name), language) ?? token.name;
            return (
            <div key={token.scryfallId} className="group relative">
              <button
                /* `relative` : le bandeau de nom se colle au bord bas de la
                   vignette, et `overflow-hidden` lui rend l'arrondi du cadre. */
                className="relative block w-full overflow-hidden rounded-lg ring-1 ring-white/10 hover:ring-2 hover:ring-sky-400 shadow-md transition-all active:scale-95"
                data-test="shelf-token"
                data-token={token.scryfallId}
                /* Une vignette d'étagère est une impression, pas un objet de
                   partie : l'aperçu passe par le chemin `scryfallId`. */
                onPointerEnter={() => hoverPreview(token.scryfallId)}
                onPointerLeave={() => hoverPreview(null)}
                onPointerDown={(event) => onItemPointerDown(token, event)}
                title={`${shownName} — cliquer pour en créer un, glisser pour le placer`}
                type="button"
              >
                <img
                  alt={shownName}
                  className="block w-full object-cover"
                  draggable={false}
                  /* URL Scryfall, comme partout : jamais via notre serveur, et
                     rien n'est préchargé ni mis en cache ici. */
                  src={src}
                />
                {/*
                  Le nom français, écrit par-dessus l'illustration — qui, elle,
                  restera anglaise : Scryfall ne publie aucun jeton traduit. Il
                  était jusqu'ici calculé pour n'aller que dans `title` et
                  `alt`, c'est-à-dire nulle part pour qui regarde l'étagère.
                  Une vignette d'étagère est **par construction** un jeton dont
                  on connaît l'impression : il n'y a pas de face cachée ici, et
                  rien à protéger.
                */}
                <TokenNameBand fontSize={9} name={shownName} />
              </button>
              <button
                className="absolute -right-1 -top-1 hidden h-4 w-4 rounded-full bg-slate-900 text-[10px] leading-4 text-slate-300 ring-1 ring-white/20 group-hover:block"
                data-test="shelf-remove"
                onClick={() => void remove(token.scryfallId)}
                title="Retirer de l'étagère"
                type="button"
              >
                ×
              </button>
              {/* Ranger l'étagère : un cran à gauche, un cran à droite. */}
              <div className="absolute inset-x-0 bottom-0 hidden justify-between group-hover:flex">
                <button
                  className="h-4 w-4 rounded-tr bg-slate-900/90 text-[10px] leading-4 text-slate-300 ring-1 ring-white/20 disabled:opacity-30"
                  data-test="shelf-left"
                  disabled={index === 0}
                  onClick={() => void move(token.scryfallId, -1)}
                  title="Déplacer vers la gauche"
                  type="button"
                >
                  &lsaquo;
                </button>
                <button
                  className="h-4 w-4 rounded-tl bg-slate-900/90 text-[10px] leading-4 text-slate-300 ring-1 ring-white/20 disabled:opacity-30"
                  data-test="shelf-right"
                  disabled={index === items.length - 1}
                  onClick={() => void move(token.scryfallId, 1)}
                  title="Déplacer vers la droite"
                  type="button"
                >
                  &rsaquo;
                </button>
              </div>
            </div>
            );
          })}
        </div>
      )}
      {copying && sources.length > 0 && (
        <ShelfCopyModal
          onClose={() => setCopying(false)}
          onPick={(source) => void copyFrom(source)}
          sources={sources}
          target={scope.kind === 'DECK' ? scope.deckName : null}
        />
      )}
    </div>
  );
}

/**
 * La fenêtre de copie : les autres étagères, chacune avec ce qu'elle apporte.
 *
 * Un clic sur une étagère la copie et referme. Aucune confirmation : copier
 * ajoute les jetons qui manquent et n'en retire aucun (`mergeTokenShelves`),
 * il n'y a donc rien à regretter. Les vignettes sont là pour reconnaître
 * l'étagère d'un coup d'œil — un nom de deck ne dit pas quels jetons il range.
 */
function ShelfCopyModal({
  sources,
  target,
  onPick,
  onClose,
}: {
  sources: ShelfSource[];
  /** Le deck qui reçoit, ou `null` pour l'étagère de la table. */
  target: string | null;
  onPick: (source: ShelfSource) => void;
  onClose: () => void;
}): React.ReactElement {
  const t = useT();
  const language = useLanguage();

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Par portail : le panneau porte un `backdrop-filter`, et un ancêtre filtré
  // devient le repère de ses descendants `fixed` — la fenêtre se serait
  // affichée dans la colonne (même raison que la carte d'identité).
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
      data-test="shelf-copy-modal"
      onClick={onClose}
      role="presentation"
    >
      <div
        aria-modal="true"
        className="scrollbar-thin max-h-[90vh] w-[min(34rem,100%)] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold leading-tight text-slate-50">{t('shelf.copy')}</h2>
            <p className="mt-1 text-xs text-slate-400">
              {target ? t('shelf.copyInto', { name: target }) : t('shelf.copyIntoTable')}
            </p>
          </div>
          <button
            className="rounded border border-slate-700 px-3 py-1 text-sm text-slate-200 hover:border-slate-500"
            data-test="shelf-copy-close"
            onClick={onClose}
            type="button"
          >
            {t('treachery.close')}
          </button>
        </div>

        <ul className="mt-4 space-y-2">
          {sources.map((source) => (
            <li key={source.id}>
              <button
                className="block w-full rounded-lg border border-slate-700 bg-slate-800/60 p-3 text-left transition-colors hover:border-sky-500 hover:bg-slate-800"
                data-source={source.id}
                data-test="shelf-copy-source"
                onClick={() => onPick(source)}
                type="button"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className={`truncate text-sm font-semibold text-slate-100 ${source.legacy ? 'italic' : ''}`}>
                    {source.name}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">
                    {t('shelf.tokenCount', { count: source.items.length })}
                  </span>
                </span>
                <span className="mt-2 flex flex-wrap gap-1.5">
                  {source.items.slice(0, 10).map((token) => {
                    const localized = localizedCard(token.scryfallId, language);
                    const shown = tokenName(localizedCardName(localized, token.name), language) ?? token.name;
                    return (
                      <img
                        key={token.scryfallId}
                        alt={shown}
                        className="h-16 rounded ring-1 ring-white/10"
                        draggable={false}
                        /* URL Scryfall, chargée par le navigateur du joueur. */
                        src={
                          resolveCardImage({
                            card: { scryfallId: token.scryfallId },
                            localized,
                            language,
                            version: 'small',
                          }).url ?? scryfallImage(token.scryfallId, 'small')
                        }
                        title={shown}
                      />
                    );
                  })}
                  {source.items.length > 10 && (
                    <span className="self-center text-xs text-slate-400">+{source.items.length - 10}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
