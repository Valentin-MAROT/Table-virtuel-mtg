/**
 * Mulligan londonien : choisir les cartes qui repartent sous la bibliothèque.
 *
 * Un bandeau au-dessus de la main, pas une modale : on choisit en **regardant
 * sa main**, et la table reste utilisable (un adversaire peut parler, on peut
 * relire le journal). Pendant qu'il est affiché, un clic simple sur une carte
 * de la main l'ajoute ou la retire (`Hand.tsx`) : choisir trois cartes au
 * doigt ne doit pas demander Ctrl.
 *
 * Rien n'est imposé (§1.1) : « Plus tard » ferme le bandeau, et les cartes se
 * remettent dessous à la main comme avant (menu, touche B).
 */
import { useEffect } from 'react';
import { mulliganBottomCount } from '@mtg/shared';
import { useGame } from '../store/game.js';
import { markMulliganDone, markOpeningKept, useMulliganPending, useOpeningPending } from '../lib/mulliganPending.js';
import { mulliganWithConfirm } from '../lib/mulligan.js';
import { useT } from '../lib/i18n/index.js';

/**
 * La main de départ : garder ou repartir, dès le lancement.
 *
 * Même place que le bandeau du mulligan, au-dessus de la main — on décide en
 * regardant ses cartes —, mais plus franc : c'est la première question de la
 * partie. Pas de confirmation ici : le bouton dit exactement ce qu'il fait, et
 * la confirmation du menu de bibliothèque protégeait d'un clic qui glisse.
 * Après un mulligan payant, `MulliganBar` prend le relais (cartes dessous).
 */
export function OpeningHandBar(): React.ReactElement | null {
  const t = useT();
  const open = useOpeningPending();
  const send = useGame((s) => s.send);
  const handSize = useGame((s) => {
    let n = 0;
    for (const c of s.cards.values()) if (c.zone.kind === 'HAND' && c.zone.seat === s.mySeat) n += 1;
    return n;
  });
  const counter = useGame((s) => {
    const me = s.seats.find((x) => x.id === s.mySeat);
    return me?.playerCounters.find((c) => c.kind === 'mulligans')?.value ?? 0;
  });
  /*
   * Avoir posé une carte, c'est avoir gardé sa main — même si le champ se vide
   * ensuite. Sans cela, le bandeau revenait dès que la dernière carte posée
   * repartait (en main, au cimetière, en zone de commandement) au premier tour.
   */
  const hasPlayed = useGame((s) => {
    for (const c of s.cards.values()) if (c.zone.seat === s.mySeat && c.zone.kind === 'BATTLEFIELD') return true;
    return false;
  });
  useEffect(() => {
    if (hasPlayed) markOpeningKept();
  }, [hasPlayed]);
  if (!open) return null;
  const nextCost = mulliganBottomCount(counter + 1);

  return (
    <div
      className="pointer-events-auto mx-auto mb-2 flex w-fit max-w-[calc(100vw-32px)] items-center gap-4 rounded-xl border border-sky-500/60 bg-slate-950/95 px-4 py-2.5 text-sm text-slate-100 shadow-2xl"
      data-test="opening-hand-bar"
      role="group"
      aria-label={t('opening.title')}
    >
      <div className="flex flex-col leading-tight">
        <span className="font-bold">{t('opening.title')}</span>
        <span className="text-xs text-slate-400">{t('card.count', { count: handSize })}</span>
      </div>
      <button
        type="button"
        data-test="opening-keep"
        className="rounded-lg bg-sky-600 px-4 py-1.5 font-bold text-white shadow hover:bg-sky-500 active:scale-[0.98]"
        title={t('opening.keepHint')}
        onClick={markOpeningKept}
      >
        {t('opening.keep')}
      </button>
      <button
        type="button"
        data-test="opening-mulligan"
        className="rounded-lg border border-slate-500 px-3.5 py-1.5 font-semibold text-slate-100 hover:border-slate-300 hover:bg-slate-800"
        title={t('opening.mulliganHint', { count: nextCost })}
        onClick={() => send({ type: 'MULLIGAN' })}
      >
        {t('opening.mulligan')}
      </button>
      <button
        type="button"
        data-test="opening-mulligan-free"
        className="px-1.5 py-1.5 text-xs font-semibold text-slate-400 hover:text-slate-100"
        title={t('opening.mulliganFreeHint')}
        onClick={() => send({ type: 'MULLIGAN', free: true })}
      >
        {t('opening.mulliganFree')}
      </button>
    </div>
  );
}

export function MulliganBar(): React.ReactElement | null {
  const pending = useMulliganPending();
  const selection = useGame((s) => s.selection);
  const cards = useGame((s) => s.cards);
  const mySeat = useGame((s) => s.mySeat);
  const send = useGame((s) => s.send);
  if (!pending || !mySeat) return null;

  const chosen = [...selection].filter((id) => {
    const c = cards.get(id);
    return c?.zone.kind === 'HAND' && c.zone.seat === mySeat;
  });
  const ready = chosen.length === pending.toBottom;

  return (
    <div
      className="pointer-events-auto mx-auto mb-2 flex w-fit max-w-[calc(100vw-32px)] flex-wrap items-center gap-2 rounded-xl border border-amber-500/50 bg-slate-950/90 px-3 py-2 text-xs text-amber-100 shadow-xl"
      data-test="mulligan-bar"
      role="status"
    >
      <span>
        Pour garder cette main, sélectionnez{' '}
        <strong>
          {pending.toBottom} carte{pending.toBottom > 1 ? 's' : ''}
        </strong>{' '}
        à remettre sous votre bibliothèque ({chosen.length}/{pending.toBottom}).
      </span>
      <button
        type="button"
        data-test="mulligan-bottom"
        disabled={!ready}
        className="rounded-lg bg-amber-500 px-2.5 py-1 font-bold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        onClick={() => {
          // Dans l'ordre choisi, une par une : `MOVE_CARDS` les insérerait toutes
          // au même rang et en renverserait l'ordre.
          for (const cardId of chosen) {
            send({ type: 'MOVE_CARD', cardId, to: { seat: mySeat, kind: 'LIBRARY' }, index: 'BOTTOM' });
          }
          useGame.getState().setSelection(new Set());
          markMulliganDone(pending.taken);
        }}
      >
        Garder et remettre dessous
      </button>
      <button
        type="button"
        className="rounded-lg border border-slate-600 px-2.5 py-1 font-semibold text-slate-200 hover:border-slate-400"
        onClick={() => void mulliganWithConfirm(send)}
      >
        Nouveau mulligan
      </button>
      <button
        type="button"
        data-test="mulligan-free"
        className="rounded-lg border border-emerald-700/70 px-2.5 py-1 font-semibold text-emerald-200 hover:border-emerald-500"
        title="Nouvelle main de sept, sans carte de plus à remettre dessous"
        onClick={() => void mulliganWithConfirm(send, true)}
      >
        Mulligan gratuit
      </button>
      <button
        type="button"
        className="px-1.5 py-1 text-slate-400 hover:text-slate-200"
        onClick={() => markMulliganDone(pending.taken)}
      >
        Plus tard
      </button>
    </div>
  );
}
