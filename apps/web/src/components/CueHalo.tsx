/**
 * Le halo d'une carte qu'un autre joueur vient de toucher (`lib/actionCues.ts`).
 *
 * Peint **autour** de la carte, à la couleur de l'auteur, sans capter le
 * pointeur : il signale, il ne gêne pas. `key` change à chaque geste, ce qui
 * relance l'animation quand la même carte est touchée deux fois de suite.
 */
import { useCues } from '../lib/actionCues.js';
import { useGame } from '../store/game.js';

export function CueHalo({ cardId }: { cardId: string }): React.ReactElement | null {
  const cue = useCues((s) => s.touched.get(cardId));
  const color = useGame((s) => (cue ? s.seats.find((x) => x.id === cue.seat)?.color : undefined));
  if (!cue) return null;
  const c = color ?? '#f59e0b';
  return (
    <span
      key={cue.n}
      aria-hidden="true"
      className="cue-halo pointer-events-none absolute -inset-1.5 rounded-xl"
      data-test="cue-halo"
      style={{ boxShadow: `0 0 0 3px ${c}, 0 0 18px 4px ${c}` }}
    />
  );
}
