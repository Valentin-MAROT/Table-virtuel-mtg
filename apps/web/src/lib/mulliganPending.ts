/**
 * Mulligan londonien en attente : combien de cartes il reste à remettre sous
 * la bibliothèque.
 *
 * Le serveur remélange et repioche sept cartes, puis annonce « N carte(s) à
 * remettre dessous » — et c'est tout : le joueur devait trouver seul comment
 * le faire. Le bandeau au-dessus de la main (`MulliganBar`) s'appuie sur ce
 * module pour savoir s'il a quelque chose à demander.
 *
 * « Fait » se retient par mulligan **pris**, gratuits compris, le temps de
 * l'onglet : une main gardée ne redemande rien, et tout nouveau mulligan —
 * payant ou gratuit — rouvre la question, puisqu'on ne remet ses cartes dessous
 * qu'en gardant la main. Le nombre à remettre, lui, ne compte que les payants.
 * Les mulligans pris se comptent dans le journal : le compteur `mulligans` ne
 * bouge pas sur un mulligan gratuit. Le stockage peut manquer (navigation privée) : on retombe alors
 * sur la mémoire de la page.
 */
import { useSyncExternalStore } from 'react';
import { mulliganBottomCount } from '@mtg/shared';
import { useGame } from '../store/game.js';

const listeners = new Set<() => void>();
const memory = new Map<string, number>();

function key(): string | null {
  const { room, mySeat } = useGame.getState();
  return room && mySeat ? `mulligan-fait:${room.code}:${mySeat}` : null;
}

function doneFor(): number {
  const k = key();
  if (!k) return 0;
  try {
    const raw = window.sessionStorage.getItem(k);
    if (raw !== null) return Number(raw) || 0;
  } catch {
    /* stockage indisponible */
  }
  return memory.get(k) ?? 0;
}

export function markMulliganDone(taken: number): void {
  const k = key();
  if (!k) return;
  memory.set(k, taken);
  try {
    window.sessionStorage.setItem(k, String(taken));
  } catch {
    /* stockage indisponible */
  }
  for (const l of listeners) l();
}

/** Mulligans que j'ai pris, payants et gratuits : une ligne de journal chacun. */
function mulligansTaken(state: ReturnType<typeof useGame.getState>): number {
  return state.log.filter((e) => e.actor === state.mySeat && e.text.includes('a pris un mulligan')).length;
}

/** `{ taken, toBottom }` si une main attend ses cartes dessous, sinon `null`. */
export function useMulliganPending(): { taken: number; toBottom: number } | null {
  const done = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    doneFor,
  );
  const counter = useGame((s) => {
    const me = s.seats.find((x) => x.id === s.mySeat);
    return me?.playerCounters.find((c) => c.kind === 'mulligans')?.value ?? 0;
  });
  const taken = useGame(mulligansTaken);
  const playing = useGame((s) => s.room?.status === 'PLAYING');
  if (!playing || taken <= done) return null;
  const toBottom = mulliganBottomCount(counter);
  return toBottom > 0 ? { taken, toBottom } : null;
}
