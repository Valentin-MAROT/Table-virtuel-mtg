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

/**
 * Le `seq` de la ligne « La partie commence » la plus récente : il identifie la
 * partie. Sans lui, les mulligans d'une manche précédente comptaient pour la
 * suivante — et le bandeau de départ laissait « Garder » une main de sept
 * après un mulligan payant.
 */
function gameStartSeq(log: ReturnType<typeof useGame.getState>['log']): number {
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i]!.text.startsWith('La partie commence')) return log[i]!.seq;
  }
  return 0;
}

function key(): string | null {
  const { room, mySeat, log } = useGame.getState();
  return room && mySeat ? `mulligan-fait:${room.code}:${mySeat}:${gameStartSeq(log)}` : null;
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
  // Finir un mulligan, c'est garder la main qu'on a : la question d'ouverture
  // ne se repose pas.
  markOpeningKept();
  try {
    window.sessionStorage.setItem(k, String(taken));
  } catch {
    /* stockage indisponible */
  }
  for (const l of listeners) l();
}

/** Mulligans que j'ai pris, payants et gratuits : une ligne de journal chacun. */
function mulligansTaken(state: ReturnType<typeof useGame.getState>): number {
  const start = gameStartSeq(state.log);
  return state.log.filter((e) => e.seq > start && e.actor === state.mySeat && e.text.includes('a pris un mulligan')).length;
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

/*
 * — La main de départ ————————————————————————————————————————————
 *
 * Au lancement, rien ne proposait le mulligan : il fallait le trouver dans le
 * menu de la bibliothèque. `OpeningHandBar` pose la question d'emblée —
 * garder ou repartir — tant que le joueur n'a pas tranché.
 *
 * « Tranché » se retient par **partie** : la clé porte le `seq` de la ligne
 * « La partie commence » du journal, si bien qu'une partie relancée à la même
 * table repose la question. Garder, ou finir un mulligan (`markMulliganDone`),
 * vaut réponse.
 */
const keptMemory = new Set<string>();

function gameKey(): string | null {
  const { room, mySeat, log } = useGame.getState();
  if (!room || !mySeat) return null;
  return `main-gardee:${room.code}:${mySeat}:${gameStartSeq(log)}`;
}

function keptFor(): boolean {
  const k = gameKey();
  if (!k) return false;
  if (keptMemory.has(k)) return true;
  try {
    return window.sessionStorage.getItem(k) === '1';
  } catch {
    return false;
  }
}

export function markOpeningKept(): void {
  const k = gameKey();
  if (!k) return;
  keptMemory.add(k);
  try {
    window.sessionStorage.setItem(k, '1');
  } catch {
    /* stockage indisponible */
  }
  for (const l of listeners) l();
}

/**
 * La main de départ attend-elle une décision ? Seulement au premier tour,
 * tant que le joueur n'a rien posé : rejoindre une partie avancée, ou avoir
 * déjà joué un terrain, n'est pas le moment de proposer un mulligan.
 */
export function useOpeningPending(): boolean {
  const kept = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    keptFor,
  );
  const pending = useMulliganPending();
  const opening = useGame((s) => {
    if (s.room?.status !== 'PLAYING' || !s.mySeat || s.turn.turnNumber > 1) return false;
    const me = s.seats.find((x) => x.id === s.mySeat);
    if (!me || me.conceded) return false;
    let hand = 0;
    for (const c of s.cards.values()) {
      if (c.zone.seat !== s.mySeat) continue;
      if (c.zone.kind === 'BATTLEFIELD') return false;
      if (c.zone.kind === 'HAND') hand += 1;
    }
    return hand > 0;
  });
  return opening && !kept && !pending;
}
