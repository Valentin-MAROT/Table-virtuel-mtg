/**
 * Les avertissements d'état (`lib/stateWarnings.ts`), sous l'ordre du tour.
 *
 * Discrets, et jamais décisifs : la ligne dit ce que les règles feraient, le
 * survol montre les cartes concernées, et le seul geste offert — envoyer une
 * créature à 0 d'endurance au cimetière — reste un bouton, sur ses propres
 * cartes. « × » masque un avertissement que la table juge faux (un effet que
 * l'outil ne voit pas) ; il revient si la situation change.
 */
import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../store/game.js';
import { cardMeta, subscribeCards } from '../lib/cards.js';
import { stateWarnings } from '../lib/stateWarnings.js';

export function StateWarnings({ onHighlight }: { onHighlight: (ids: string[]) => void }): React.ReactElement | null {
  const seats = useGame((s) => s.seats);
  const cards = useGame((s) => s.cards);
  const mySeat = useGame((s) => s.mySeat);
  const playing = useGame((s) => s.room?.status === 'PLAYING');
  const send = useGame((s) => s.send);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  // Les types et endurances arrivent par lots du catalogue : on recalcule alors.
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeCards(() => setTick((n) => n + 1)), []);

  const warnings = useMemo(
    () => stateWarnings(seats, cards.values(), (id) => cardMeta(id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seats, cards, tick],
  );
  const shown = warnings.filter((w) => !hidden.has(w.id));
  if (!playing || shown.length === 0) return null;

  return (
    <ul
      className="pointer-events-auto mt-2 space-y-1 rounded-xl border border-amber-600/40 bg-slate-900/90 p-2 text-[11px] text-amber-100 shadow-xl backdrop-blur-md"
      data-test="state-warnings"
    >
      {shown.map((w) => (
        <li
          key={w.id}
          className="flex items-center gap-1.5"
          onMouseEnter={() => onHighlight(w.cardIds)}
          onMouseLeave={() => onHighlight([])}
        >
          <span aria-hidden="true" className="text-amber-400">⚠</span>
          <span className="flex-1">{w.text}</span>
          {w.suggest === 'GRAVEYARD' && w.seat === mySeat && (
            <button
              type="button"
              className="rounded border border-amber-600/60 px-1.5 py-0.5 text-[10px] font-semibold hover:bg-amber-900/50"
              onClick={() => {
                for (const cardId of w.cardIds) {
                  const card = cards.get(cardId);
                  if (card) send({ type: 'MOVE_CARD', cardId, to: { seat: card.owner, kind: 'GRAVEYARD' } });
                }
              }}
            >
              Au cimetière
            </button>
          )}
          <button
            type="button"
            aria-label="Masquer"
            title="Masquer cet avertissement"
            className="px-1 text-slate-500 hover:text-slate-200"
            onClick={() => setHidden((h) => new Set([...h, w.id]))}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
