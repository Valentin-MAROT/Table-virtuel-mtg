/**
 * La carte qu'un adversaire vient de jouer, montrée en grand.
 *
 * À une vraie table, on pose la carte et on la nomme ; ici elle apparaissait,
 * minuscule, quelque part sur un plateau qu'on ne regardait pas, et seul le
 * journal le disait. L'encart la montre à droite de la table, avec l'auteur et
 * le geste (joue, lance, défausse, exile), quelques secondes
 * (`lib/actionCues.ts`). Trois au plus, la plus récente en bas.
 *
 * Un clic l'écarte ; le survol ouvre l'aperçu habituel. Rien n'y est jamais
 * nécessaire : le journal garde la trace.
 */
import { cardMeta, scryfallImage } from '../lib/cards.js';
import { localizedCard, localizedCardName, useLocalizationTick } from '../lib/cardLocalization.js';
import { resolveCardImage, useT } from '../lib/i18n/index.js';
import { dismissPlayed, useCues } from '../lib/actionCues.js';
import { useLanguage } from '../store/prefs.js';
import { useGame } from '../store/game.js';

const FROM: Partial<Record<string, 'cue.from.COMMAND' | 'cue.from.GRAVEYARD' | 'cue.from.EXILE' | 'cue.from.LIBRARY'>> = {
  COMMAND: 'cue.from.COMMAND',
  GRAVEYARD: 'cue.from.GRAVEYARD',
  EXILE: 'cue.from.EXILE',
  LIBRARY: 'cue.from.LIBRARY',
};

export function PlayedCardSpotlight(): React.ReactElement | null {
  useLocalizationTick();
  const t = useT();
  const language = useLanguage();
  const played = useCues((s) => s.played);
  const seats = useGame((s) => s.seats);
  const hoverPreview = useGame((s) => s.hoverPreview);
  if (played.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed top-1/2 z-30 flex -translate-y-1/2 flex-col gap-2"
      style={{ right: 276 }}
      data-test="played-spotlight"
    >
      {played.map((cue) => {
        const seat = seats.find((s) => s.id === cue.seat);
        const color = seat?.color ?? '#94a3b8';
        const meta = cardMeta(cue.card.scryfallId);
        const localized = localizedCard(cue.card.scryfallId, language);
        const src =
          resolveCardImage({
            card: meta ?? { scryfallId: cue.card.scryfallId },
            localized,
            language,
            version: 'normal',
          }).url ?? scryfallImage(cue.card.scryfallId, 'normal');
        const name = localizedCardName(localized, meta?.name) ?? '';
        const small = played.length > 1;
        return (
          <button
            key={cue.id}
            type="button"
            className="cue-pop pointer-events-auto flex flex-col overflow-hidden rounded-xl border-2 bg-slate-950/95 text-left shadow-2xl shadow-black/70"
            style={{ borderColor: color, width: small ? 132 : 172 }}
            data-test="played-card"
            title={t('cue.dismiss')}
            onClick={() => {
              hoverPreview(null);
              dismissPlayed(cue.id);
            }}
            onPointerEnter={() => hoverPreview(cue.card.scryfallId)}
            onPointerLeave={() => hoverPreview(null)}
          >
            <span className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold text-slate-100">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
              <span className="truncate">
                {t(`cue.verb.${cue.verb}`, { name: seat?.displayName ?? '' })}
                {FROM[cue.from] && ` ${t(FROM[cue.from]!)}`}
              </span>
            </span>
            <img alt={name} className="block w-full" draggable={false} src={src} />
          </button>
        );
      })}
    </div>
  );
}
