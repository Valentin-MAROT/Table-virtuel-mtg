/**
 * La réserve de mana flottant, en bas à droite de la vue.
 *
 * **Elle compte, elle n'arbitre pas.** Rien ici ne vérifie qu'un terrain a été
 * engagé, ne retire du mana quand un sort part, ni ne vide la réserve au
 * changement d'étape — c'est la frontière du §1.1 de `docs/protocol.md`, et
 * elle passe exactement là : assister est permis, conclure ne l'est pas. Le
 * joueur compte, comme il le ferait avec des dés sur une vraie table ; le menu
 * lui évite seulement de tenir le compte de tête.
 *
 * **L'état vit au serveur**, sous des compteurs de joueur `mana:W`… `mana:C`
 * (voir `packages/shared/src/protocol/mana.ts` pour le pourquoi du chemin
 * choisi). Deux conséquences visibles : un rechargement de page ne perd pas le
 * compte, et la table voit la réserve de chacun sur son panneau de siège — ce
 * qui est le point, puisque c'est elle qui dit si un joueur peut répondre.
 *
 * **Chaque clic part tout de suite**, et c'est un choix qui a été pris puis
 * repris. Le premier jet passait par `lib/counterBatch.ts`, comme la vie et les
 * dégâts de commandant : un intent par couleur au lieu d'un par clic. Une sonde
 * au navigateur a montré ce que cela coûtait — un retrait suivi d'un
 * rechargement dans la seconde et demie **était perdu**, le nettoyage de React
 * ne tournant pas sur un rechargement de page.
 *
 * Or le regroupement n'achetait plus rien ici. Il existe pour épargner au
 * journal douze lignes par décompte de points de vie ; le journal ne dit **rien**
 * des réserves de mana (voir `engine-2.ts`), et cinq intents dans la seconde ne
 * pèsent rien contre les vingt par seconde que le protocole autorise. Restaient
 * donc deux inconvénients sans contrepartie : une perte possible, et une
 * seconde et demie pendant laquelle la table ne voit pas une réserve qui existe
 * — alors que c'est précisément pour qu'elle la voie qu'elle est partagée.
 *
 * **Le repli est une préférence d'appareil, pas de compte** : il vit dans
 * `localStorage` et non dans `UserPrefs`. Montrer ou replier un panneau dépend
 * de la place qu'on a à l'écran, qui n'est pas la même sur le portable et sur
 * le bureau — une préférence de compte suivrait le joueur là où elle a tort.
 */
import { useEffect, useRef, useState } from 'react';
import { MANA_POOL_SYMBOLS, manaCounterKind, type ManaPoolSymbol } from '@mtg/shared';
import { useGame } from '../store/game.js';
import { manaSymbolUrl } from './ManaCost.js';

const STORAGE_KEY = 'mtg.manaPool.open';

/**
 * Le repli, relu au montage.
 *
 * Tout est enveloppé : en navigation privée, `localStorage` **lève** au lieu de
 * rendre `null`, et un panneau qui fait planter la table parce qu'il n'a pas pu
 * lire sa préférence d'affichage serait une jolie disproportion.
 */
function readOpen(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'closed';
  } catch {
    return true;
  }
}

function writeOpen(open: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, open ? 'open' : 'closed');
  } catch {
    // Stockage refusé : le repli ne survivra pas au rechargement, et c'est tout.
  }
}

/** Le nom lu à voix haute, pour l'infobulle et les lecteurs d'écran. */
const LABELS: Record<ManaPoolSymbol, string> = {
  W: 'blanc',
  U: 'bleu',
  B: 'noir',
  R: 'rouge',
  G: 'vert',
  C: 'incolore',
};

export function ManaPool(): React.ReactElement | null {
  const mySeat = useGame((s) => s.mySeat);
  const seats = useGame((s) => s.seats);
  const send = useGame((s) => s.send);
  const [open, setOpen] = useState(readOpen);
  const box = useRef<HTMLDivElement>(null);

  const me = seats.find((s) => s.id === mySeat);
  const seated = Boolean(me);

  /*
   * La réserve est en `fixed` dans le coin bas droit, et elle n'a pas une
   * taille : dépliée elle fait 310 px sur 110, repliée c'est une pastille. Ce
   * qui l'entoure — la colonne du panneau joueur au-dessus, le rail de main à
   * gauche — doit lui céder exactement cette place, pas une constante : sur
   * un portable, dépliée, elle recouvrait l'étagère à jetons et la dernière
   * carte de la main. Elle publie donc sa boîte, et les voisins la lisent
   * (`--mana-pool-w`, `--mana-pool-h`).
   */
  useEffect(() => {
    const node = box.current;
    const root = document.documentElement;
    if (!node) return;
    const publish = (): void => {
      const rect = node.getBoundingClientRect();
      root.style.setProperty('--mana-pool-w', `${Math.ceil(rect.width)}px`);
      root.style.setProperty('--mana-pool-h', `${Math.ceil(rect.height)}px`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--mana-pool-w');
      root.style.removeProperty('--mana-pool-h');
    };
  }, [seated, open]);
  // Un spectateur n'a pas de réserve : il n'a pas de siège.
  if (!me) return null;

  const stored = new Map(me.playerCounters.map((c) => [c.kind, c.value ?? 0]));
  /** L'état du serveur, et lui seul : rien n'est prédit ici. */
  const valueOf = (symbol: ManaPoolSymbol): number => stored.get(manaCounterKind(symbol)) ?? 0;

  const setValue = (symbol: ManaPoolSymbol, value: number): void => {
    send({
      type: 'SET_PLAYER_COUNTER',
      seat: me.id,
      kind: manaCounterKind(symbol),
      // Borné à zéro : on ne descend pas sous la suppression du compteur.
      value: Math.max(0, value),
    });
  };

  const pool = MANA_POOL_SYMBOLS.map((symbol) => ({ symbol, value: valueOf(symbol) }));
  const total = pool.reduce((sum, { value }) => sum + value, 0);
  const flottant = pool.filter(({ value }) => value > 0);

  const toggle = (): void => {
    setOpen((was) => {
      writeOpen(!was);
      return !was;
    });
  };

  const symbole = (symbol: ManaPoolSymbol, size: number): React.ReactElement => {
    const url = manaSymbolUrl(symbol);
    // Le symbole vient du CDN de Scryfall, comme partout ailleurs : rien n'est
    // hébergé ici. S'il manquait, la lettre reste lisible plutôt que rien.
    return url ? (
      <img alt={LABELS[symbol]} className="shrink-0" height={size} src={url} width={size} />
    ) : (
      <span className="shrink-0 font-bold">{symbol}</span>
    );
  };

  return (
    /*
      `fixed` et non `absolute`, et `z-30` : exactement pour la même raison que
      les boutons de cadrage d'en face — le rail de main est un frère de la
      table dans la page, et un z-index posé à l'intérieur de la table ne
      pèserait pas contre lui.
    */
    <div
      ref={box}
      className="fixed bottom-3 right-3 z-30 flex flex-col items-end gap-1"
      data-test="mana-pool"
    >
      {open ? (
        <div className="w-max rounded-lg border border-edge bg-panel/95 shadow-xl backdrop-blur">
          <div className="flex items-center justify-between gap-3 border-b border-edge px-2.5 py-1.5">
            <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-slate-400">
              Mana flottant
            </span>
            <div className="flex items-center gap-1.5">
              {total > 0 && (
                <button
                  className="rounded border border-edge px-1.5 py-0.5 text-[0.7rem] text-slate-400 hover:border-slate-500 hover:text-slate-200"
                  data-test="mana-clear"
                  onClick={() => {
                    for (const { symbol } of pool) setValue(symbol, 0);
                  }}
                  title="Vider la réserve"
                  type="button"
                >
                  Vider
                </button>
              )}
              <button
                className="px-1 text-sm leading-none text-slate-500 hover:text-slate-200"
                data-test="mana-toggle"
                onClick={toggle}
                title="Replier"
                type="button"
              >
                ▾
              </button>
            </div>
          </div>

          <div className="flex gap-1.5 p-2" data-test="mana-cells">
            {pool.map(({ symbol, value }) => (
              <div key={symbol} className="flex w-11 flex-col items-center gap-1">
                {/*
                  **Le retrait a son propre bouton, et il se voit.**

                  Le premier jet faisait du **nombre** la commande de retrait :
                  le symbole ajoutait, le compte retirait. C'était compact, et
                  c'était une affordance invisible — rien n'annonçait qu'un
                  nombre se clique, et un joueur avec deux rouges cherchait
                  comment en enlever un seul sans le trouver. Une commande qu'il
                  faut deviner n'existe pas.

                  Le couple `−` / `+` est repris tel quel du panneau joueur —
                  vie, dégâts de commandant, taxe l'emploient déjà. Un seul
                  idiome pour un seul geste, appris une fois.

                  Le symbole reste cliquable et ajoute, lui aussi : c'est la
                  grande cible du geste le plus fréquent, quand on engage ses
                  terrains l'un après l'autre.
                */}
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-800/80 ring-1 ring-slate-700 transition-all hover:bg-slate-700 active:scale-90"
                  data-test={`mana-add-${symbol}`}
                  onClick={() => setValue(symbol, value + 1)}
                  title={`Un mana ${LABELS[symbol]} de plus`}
                  type="button"
                >
                  {symbole(symbol, 20)}
                </button>

                <span
                  className={`font-mono text-sm leading-none tabular-nums ${
                    value > 0 ? 'font-bold text-slate-100' : 'text-slate-600'
                  }`}
                  data-test={`mana-value-${symbol}`}
                >
                  {value}
                </span>

                <div className="flex items-center gap-0.5">
                  <button
                    className="flex h-5 w-5 items-center justify-center rounded bg-slate-800 text-xs leading-none text-slate-300 ring-1 ring-slate-700 transition-colors hover:bg-rose-800 hover:text-white disabled:opacity-30 disabled:hover:bg-slate-800"
                    data-test={`mana-minus-${symbol}`}
                    disabled={value === 0}
                    onClick={() => setValue(symbol, value - 1)}
                    title={`Un mana ${LABELS[symbol]} de moins`}
                    type="button"
                  >
                    −
                  </button>
                  <button
                    className="flex h-5 w-5 items-center justify-center rounded bg-slate-800 text-xs leading-none text-slate-300 ring-1 ring-slate-700 transition-colors hover:bg-emerald-800 hover:text-white"
                    data-test={`mana-plus-${symbol}`}
                    onClick={() => setValue(symbol, value + 1)}
                    title={`Un mana ${LABELS[symbol]} de plus`}
                    type="button"
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /*
          Replié, il reste **une pastille qui dit l'essentiel** plutôt qu'un
          bouton muet : ce qui flotte, et combien. Un compteur qu'on replie pour
          gagner de la place ne doit pas obliger à le rouvrir pour savoir s'il
          contient quelque chose — c'est justement quand il n'est pas vide qu'on
          ne veut pas l'oublier.
        */
        <button
          className="flex items-center gap-1.5 rounded-lg border border-edge bg-panel/95 px-2.5 py-1.5 text-xs text-slate-300 shadow-xl backdrop-blur hover:border-slate-500 hover:text-white"
          data-test="mana-toggle"
          onClick={toggle}
          title="Déplier la réserve de mana"
          type="button"
        >
          {flottant.length === 0 ? (
            <span className="text-slate-500">Mana flottant</span>
          ) : (
            flottant.map(({ symbol, value }) => (
              <span key={symbol} className="flex items-center gap-0.5 font-mono tabular-nums">
                {symbole(symbol, 14)}
                {value}
              </span>
            ))
          )}
          <span className="text-slate-500">▴</span>
        </button>
      )}
    </div>
  );
}
