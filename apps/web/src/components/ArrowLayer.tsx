/**
 * Les flèches de la table, et le mode de visée qui les trace.
 *
 * **Mesurées sur le DOM, pas recalculées.** Une carte du champ a sa place dans
 * son panneau, son panneau dans la grille, la grille sous la caméra, et les
 * attachements la décalent encore : refaire ce calcul ici serait en écrire un
 * second, qui divergerait du premier. On lit donc la boîte des éléments
 * (`[data-card-id]`, `[data-zone]`) à chaque image tant qu'il y a quelque chose
 * à dessiner — quelques flèches, c'est quelques `getBoundingClientRect`.
 *
 * Le calque ne capte jamais le pointeur, sauf en visée : il écoute alors la
 * fenêtre en capture, prend le premier clic sur une carte ou un plateau, et
 * l'empêche d'aller plus loin (sans quoi la carte visée s'ouvrirait ou
 * partirait en glissement).
 */
import { useEffect, useRef, useState } from 'react';
import type { Arrow, ArrowEnd, ArrowKind } from '@mtg/shared';
import { useGame } from '../store/game.js';
import { cancelPick, sendArrows, useArrowPick } from '../lib/arrows.js';
import { useT } from '../lib/i18n/index.js';

const COLORS: Record<ArrowKind, string> = { ATTACK: '#ef4444', BLOCK: '#38bdf8', TARGET: '#f59e0b' };

type Pt = { x: number; y: number };
type Drawn = { id: string; kind: ArrowKind; a: Pt; b: Pt };

function cardEl(id: string): Element | null {
  const all = document.querySelectorAll(`[data-card-id="${CSS.escape(id)}"]`);
  for (const el of all) {
    const zone = el.closest('[data-zone]')?.getAttribute('data-zone') ?? '';
    if (zone.endsWith('|BATTLEFIELD') || zone.endsWith('|STACK_NOTE')) return el;
  }
  return all[0] ?? null;
}

function center(el: Element): Pt {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function endPoint(end: ArrowEnd): Pt | null {
  if ('card' in end) {
    const el = cardEl(end.card);
    return el ? center(el) : null;
  }
  // Le bandeau d'identité du joueur, pas le centre de son plateau : une flèche
  // posée au milieu du terrain se lisait comme visant la carte qui s'y trouve.
  const badge = document.querySelector(`[data-seat-anchor="${CSS.escape(end.seat)}"]`);
  if (badge) return center(badge);
  const el = document.querySelector(`[data-zone="${CSS.escape(`${end.seat}|BATTLEFIELD`)}"]`);
  return el ? center(el) : null;
}

/** Une courbe douce, raccourcie au bout pour que la pointe reste visible. */
function path(a: Pt, b: Pt): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const bend = Math.min(80, len * 0.18);
  const cx = (a.x + b.x) / 2 - (dy / len) * bend;
  const cy = (a.y + b.y) / 2 + (dx / len) * bend;
  const back = Math.min(14, len / 4);
  const ex = b.x - ((b.x - cx) / Math.hypot(b.x - cx, b.y - cy)) * back;
  const ey = b.y - ((b.y - cy) / Math.hypot(b.x - cx, b.y - cy)) * back;
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${ex} ${ey}`;
}

/** Le siège d'un élément de table cliqué, par son `data-zone` (`seat|KIND`). */
function seatOf(el: Element | null): string | null {
  const zone = el?.closest('[data-zone]')?.getAttribute('data-zone');
  return zone ? zone.split('|')[0] ?? null : null;
}

export function ArrowLayer(): React.ReactElement | null {
  const t = useT();
  const arrows = useGame((s) => s.arrows);
  const mySeat = useGame((s) => s.mySeat);
  const pick = useArrowPick((s) => s.pick);
  const [drawn, setDrawn] = useState<Drawn[]>([]);
  const [pointer, setPointer] = useState<Pt | null>(null);
  const [pickFrom, setPickFrom] = useState<Pt[]>([]);
  const last = useRef('');

  // Mesure à chaque image, tant qu'il y a quelque chose à dessiner.
  useEffect(() => {
    if (arrows.length === 0 && !pick) {
      if (last.current !== '') {
        last.current = '';
        setDrawn([]);
        setPickFrom([]);
      }
      return;
    }
    let raf = 0;
    const tick = (): void => {
      const next: Drawn[] = [];
      for (const arrow of arrows as Arrow[]) {
        const fromEl = cardEl(arrow.from);
        const b = endPoint(arrow.to);
        if (fromEl && b) next.push({ id: arrow.id, kind: arrow.kind, a: center(fromEl), b });
      }
      const sources = (pick?.from ?? []).map((id) => cardEl(id)).filter((e): e is Element => !!e).map(center);
      const key = JSON.stringify([next, sources]);
      if (key !== last.current) {
        last.current = key;
        setDrawn(next);
        setPickFrom(sources);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [arrows, pick]);

  // La visée : le pointeur, le clic qui choisit, Échap qui abandonne.
  useEffect(() => {
    if (!pick) {
      setPointer(null);
      return;
    }
    const onMove = (e: PointerEvent): void => setPointer({ x: e.clientX, y: e.clientY });
    const onDown = (e: PointerEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      if (e.button !== 0) {
        cancelPick();
        return;
      }
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cardTarget = el?.closest('[data-card-id]')?.getAttribute('data-card-id') ?? null;
      const seat = seatOf(el);
      let to: ArrowEnd | null = null;
      if (pick.kind === 'BLOCK') {
        if (cardTarget && !pick.from.includes(cardTarget)) to = { card: cardTarget };
      } else if (pick.kind === 'ATTACK') {
        // On attaque un joueur — ou une carte qui se laisse attaquer
        // (planeswalker, bataille) : un clic sur elle la vise, elle.
        if (cardTarget && seat && seat !== mySeat) to = { card: cardTarget };
        else if (seat && seat !== mySeat) to = { seat };
      } else if (cardTarget && !pick.from.includes(cardTarget)) {
        to = { card: cardTarget };
      } else if (seat) {
        to = { seat };
      }
      if (!to) return;
      sendArrows(pick.kind, pick.from, to);
      cancelPick();
    };
    const swallow = (e: Event): void => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        cancelPick();
      }
    };
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerdown', onDown, true);
    // Le clic et le menu contextuel qui suivent l'appui ne doivent rien ouvrir.
    window.addEventListener('click', swallow, true);
    window.addEventListener('contextmenu', swallow, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('click', swallow, true);
      window.removeEventListener('contextmenu', swallow, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [pick, mySeat]);

  if (drawn.length === 0 && !pick) return null;

  return (
    <>
      <svg className="pointer-events-none fixed inset-0 z-[15] h-full w-full" data-test="arrow-layer" aria-hidden="true">
        <defs>
          {(Object.keys(COLORS) as ArrowKind[]).map((k) => (
            <marker
              key={k}
              id={`arrow-head-${k}`}
              viewBox="0 0 10 10"
              refX="2"
              refY="5"
              markerWidth="4"
              markerHeight="4"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={COLORS[k]} stroke="#020617" strokeWidth="1" />
            </marker>
          ))}
        </defs>
        {drawn.map((d) => (
          <g key={d.id} data-test={`arrow-${d.kind}`}>
            <path d={path(d.a, d.b)} fill="none" stroke="#020617" strokeOpacity="0.75" strokeWidth="9" strokeLinecap="round" />
            <path
              d={path(d.a, d.b)}
              fill="none"
              stroke={COLORS[d.kind]}
              strokeWidth="5"
              strokeLinecap="round"
              markerEnd={`url(#arrow-head-${d.kind})`}
            />
            <circle cx={d.a.x} cy={d.a.y} r="6" fill={COLORS[d.kind]} stroke="#020617" strokeWidth="2" />
          </g>
        ))}
        {pick &&
          pointer &&
          pickFrom.map((a, i) => (
            <path
              key={i}
              d={path(a, pointer)}
              fill="none"
              stroke={COLORS[pick.kind]}
              strokeWidth="4"
              strokeDasharray="10 8"
              strokeLinecap="round"
              markerEnd={`url(#arrow-head-${pick.kind})`}
            />
          ))}
      </svg>
      {pick && (
        <div className="pointer-events-none fixed inset-x-0 top-16 z-40 flex justify-center" data-test="arrow-pick-banner">
          <div
            className="rounded-full border-2 bg-slate-950/95 px-4 py-1.5 text-sm font-semibold text-slate-100 shadow-xl"
            style={{ borderColor: COLORS[pick.kind] }}
          >
            {t(`arrow.pick.${pick.kind}`)}
            <span className="ml-2 text-xs font-normal text-slate-400">{t('arrow.pickCancel')}</span>
          </div>
        </div>
      )}
    </>
  );
}
