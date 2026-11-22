/**
 * L'annonce du tour, au milieu de la table.
 *
 * Le nouveau tour ne se lisait que dans le panneau « Ordre du tour », dans un
 * coin : qui regardait sa main ou le plateau adverse ratait son tour, et la
 * table attendait. À une vraie table, on vous le dit.
 *
 * - **Mon tour** : un encart au centre, « À vous de jouer », avec le geste qui
 *   suit presque toujours (dégager et piocher) et la cloche
 *   (`lib/turnBell.ts`). Il s'efface seul ; le survoler le retient, un clic
 *   ailleurs ou Échap le ferme. Rien n'est imposé (§1.1) : le bouton du
 *   panneau reste là si on le laisse filer.
 * - **Le tour d'un autre** : un bandeau discret sous la barre d'outils, sans
 *   son. On sait qui joue sans être interrompu.
 * - **Onglet en arrière-plan** : le titre de la page le dit, jusqu'au retour.
 *
 * Ne réagit qu'à `turnCue`, que seuls les événements de passage posent :
 * rejoindre une partie en cours n'annonce rien.
 */
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../store/game.js';
import { useT } from '../lib/i18n/index.js';
import { drawsThisTurn, startOfTurnIntents } from '../lib/turn.js';
import { ringTurnBell } from '../lib/turnBell.js';

const MINE_MS = 3200;
const OTHER_MS = 2000;

type Shown = { id: number; mine: boolean; name: string; color: string; turnNumber: number };

export function TurnAnnounce(): React.ReactElement | null {
  const t = useT();
  const cue = useGame((s) => s.turnCue);
  const send = useGame((s) => s.send);
  const phase = useGame((s) => s.turn.phase);
  const activeSeat = useGame((s) => s.turn.activeSeat);
  const mySeat = useGame((s) => s.mySeat);
  const playing = useGame((s) => s.seats.filter((x) => !x.conceded).length);
  const [shown, setShown] = useState<Shown | null>(null);
  const [entered, setEntered] = useState(false);
  const timer = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const clear = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const close = (): void => {
    clear();
    setShown(null);
    setEntered(false);
  };
  const schedule = (ms: number): void => {
    clear();
    timer.current = window.setTimeout(close, ms);
  };

  useEffect(() => {
    if (!cue) return;
    const { mySeat, seats, room } = useGame.getState();
    if (room?.status !== 'PLAYING') return;
    const seat = seats.find((s) => s.id === cue.seat);
    const mine = cue.seat === mySeat;
    setShown({
      id: cue.id,
      mine,
      name: seat?.displayName ?? '',
      color: seat?.color ?? '#10b981',
      turnNumber: cue.turnNumber,
    });
    setEntered(false);
    const raf = requestAnimationFrame(() => setEntered(true));
    schedule(mine ? MINE_MS : OTHER_MS);
    if (mine) {
      ringTurnBell();
      flagTitleIfHidden(t('turn.announceMine'));
    }
    return () => cancelAnimationFrame(raf);
    // `t` change avec la langue : ce n'est pas une raison de réannoncer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cue?.id]);

  // Un clic ailleurs ou Échap ferme l'encart : il ne doit jamais gêner.
  useEffect(() => {
    if (!shown?.mine) return;
    const onDown = (e: PointerEvent): void => {
      if (cardRef.current?.contains(e.target as Node)) return;
      close();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown?.id, shown?.mine]);

  useEffect(() => clear, []);

  if (!shown) return null;

  if (!shown.mine) {
    return (
      <div className="pointer-events-none fixed inset-x-0 top-16 z-30 flex justify-center" data-test="turn-announce-other">
        <div
          className={`flex items-center gap-2 rounded-full border border-slate-600/70 bg-slate-950/90 px-4 py-1.5 text-sm text-slate-200 shadow-xl transition-all duration-300 motion-reduce:transition-none ${
            entered ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
          }`}
          role="status"
        >
          <span className="h-2.5 w-2.5 rounded-full ring-2 ring-black/60" style={{ background: shown.color }} />
          <span className="font-semibold">{t('turn.announceOther', { name: shown.name })}</span>
          <span className="tabular-nums text-slate-400">{t('turn.announceNumber', { n: shown.turnNumber })}</span>
        </div>
      </div>
    );
  }

  // Le geste ne s'offre que tant qu'il a un sens : si le joueur a déjà dégagé
  // depuis le panneau, le bouton disparaît de l'encart aussi.
  const offersStart = phase === 'UNTAP' && activeSeat === mySeat;
  const draws = drawsThisTurn(shown.turnNumber, playing);

  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center" data-test="turn-announce">
      <div
        ref={cardRef}
        className={`pointer-events-auto flex flex-col items-center gap-3 rounded-2xl border-2 bg-slate-950/90 px-12 py-7 text-center shadow-2xl shadow-black/60 transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${
          entered ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
        style={{ borderColor: shown.color }}
        role="status"
        aria-live="polite"
        onMouseEnter={clear}
        onMouseLeave={() => schedule(1500)}
      >
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 tabular-nums">
          {t('turn.announceNumber', { n: shown.turnNumber })}
        </span>
        <span className="text-4xl font-bold tracking-tight text-white">{t('turn.announceMine')}</span>
        {offersStart && (
          <button
            type="button"
            data-test="turn-announce-start"
            className="mt-1 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-bold text-white shadow hover:bg-emerald-500 active:scale-[0.98]"
            onClick={() => {
              for (const intent of startOfTurnIntents()) send(intent);
              close();
            }}
          >
            {draws ? t('turn.startUntapDraw') : t('turn.startUntap')}
          </button>
        )}
      </div>
    </div>
  );
}

/** Si l'onglet est caché, le titre le dit jusqu'au retour du joueur. */
function flagTitleIfHidden(text: string): void {
  if (typeof document === 'undefined' || !document.hidden || document.title.startsWith('●')) return;
  const original = document.title;
  document.title = `● ${text} — ${original}`;
  const restore = (): void => {
    if (document.hidden) return;
    document.title = original;
    document.removeEventListener('visibilitychange', restore);
  };
  document.addEventListener('visibilitychange', restore);
}
