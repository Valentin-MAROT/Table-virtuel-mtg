/**
 * L'étagère à jetons d'un deck, dans « Mes decks », et la copie depuis un autre.
 *
 * Chaque source est un bouton : un clic copie, sans question. C'est sans danger
 * parce que copier **ajoute** — ce que le deck a déjà reste en place — et c'est
 * pourquoi une source qui n'apporterait rien n'est pas proposée du tout.
 *
 * Ce composant vit à part de `pages/Decks.tsx` pour une raison précise : les
 * noms affichés ici sont des noms de **jetons**, qui passent par le glossaire
 * (`tokenName`), alors que la page n'affiche que des noms propres de cartes,
 * qui ne doivent jamais y passer — la recette le vérifie sur son texte.
 */
import type { DeckSummary } from '@mtg/shared';
import { localizedCard, localizedCardName } from '../lib/cardLocalization.js';
import { tokenName, useT } from '../lib/i18n/index.js';
import { shelfSources, type ShelfSource, type ShelfToken } from '../lib/shelf.js';
import { useLanguage } from '../store/prefs.js';
import { previewHoverProps } from './CardPreview.js';

export function DeckTokenShelf({
  deck,
  decks,
  legacy,
  busy,
  onCopy,
}: {
  deck: DeckSummary;
  decks: readonly DeckSummary[];
  /** L'ancienne étagère commune : une source de copie parmi les autres. */
  legacy: readonly ShelfToken[];
  busy: boolean;
  onCopy: (source: ShelfSource) => void;
}): React.ReactElement | null {
  const t = useT();
  const language = useLanguage();
  const sources = shelfSources(
    decks,
    legacy,
    { deckId: deck.id, items: deck.tokenShelf },
    t('shelf.legacy'),
  );
  // Ni jeton ni source : la ligne ne s'alourdit pas pour rien.
  if (deck.tokenShelf.length === 0 && sources.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1" data-test="deck-token-shelf">
      <span className="text-[0.78rem] text-[color:var(--site-floor-dim)]">
        {deck.tokenShelf.length === 0
          ? t('deck.tokensNone')
          : t('deck.tokens', { count: deck.tokenShelf.length })}
        {deck.tokenShelf.length > 0 && ' · '}
        {deck.tokenShelf.map((token, index) => (
          <span key={token.scryfallId}>
            {index > 0 && ' · '}
            <span
              className="cursor-help underline decoration-dotted underline-offset-2"
              data-test="deck-token"
              {...previewHoverProps(token.scryfallId)}
            >
              {tokenName(
                localizedCardName(localizedCard(token.scryfallId, language), token.name),
                language,
              ) ?? token.name}
            </span>
          </span>
        ))}
      </span>
      {sources.length > 0 && (
        <span className="flex flex-wrap items-baseline gap-1.5">
          <span className="text-[0.72rem] text-[color:var(--site-floor-dim)]">
            {t('deck.tokensCopyFrom')}
          </span>
          {sources.map((source) => (
            <button
              key={source.id}
              className="floor-button px-2.5 py-1 text-[0.66rem]"
              data-source={source.id}
              data-test="deck-token-copy"
              disabled={busy}
              onClick={() => onCopy(source)}
              title={t('deck.tokensCopyHint', { name: source.name })}
              type="button"
            >
              {source.name} ({source.items.length})
            </button>
          ))}
        </span>
      )}
    </div>
  );
}
