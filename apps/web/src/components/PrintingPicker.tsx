import { useEffect, useState } from 'react';
import type { PublicCardView } from '@mtg/shared';
import { api, type CardMeta } from '../lib/api.js';
import { scryfallImage } from '../lib/cards.js';
import { localizedCard, localizedCardName, useLocalizationTick } from '../lib/cardLocalization.js';
import { resolveCardImage, useT } from '../lib/i18n/index.js';
import { useGame } from '../store/game.js';
import { useLanguage } from '../store/prefs.js';
import { useCloseOnEscape } from '../lib/overlay.js';

/**
 * Choix d'une impression précise pour une carte déjà en jeu, foil compris.
 * Les impressions viennent de la base locale : aucun appel à Scryfall ici.
 *
 * **Deux identifiants, et il ne faut jamais les confondre.** `printing.scryfallId`
 * est celui du **catalogue** : c'est lui qu'on compare à l'impression en jeu et
 * lui seul qui part dans `SET_PRINTING`. L'impression française a un identifiant
 * différent, qui vit dans la résolution localisée et ne sert qu'à choisir
 * l'illustration montrée — `resolveCardImage` s'en charge, et rien de ce qui
 * sort d'ici ne le porte.
 */
export function PrintingPicker({
  card,
  onClose,
}: {
  card: PublicCardView;
  onClose: () => void;
}): React.ReactElement {
  const t = useT();
  const send = useGame((s) => s.send);
  const [printings, setPrintings] = useState<CardMeta[] | null>(null);
  const [foil, setFoil] = useState(card.isFoil);
  useCloseOnEscape(onClose);
  useLocalizationTick();
  const language = useLanguage();

  /*
   * L'aperçu agrandi est celui de la salle, et il n'y en a pas d'autre.
   *
   * Trois choses le rendent possible, et aucune n'est accessoire :
   *
   * - **Le voile est à `z-40`**, comme la recherche de jeton et la consultation,
   *   et non plus à `z-50`. L'aperçu de la salle vit à `z-[45]` : c'est cette
   *   hauteur-là, et elle seule, qui le fait passer au-dessus du voile au lieu
   *   d'être peint gris dessous.
   * - **Aucune seconde instance n'est montée ici.** `DeckEditor` en monte une,
   *   mais il vit hors de la table où il n'y en a aucune ; en monter une ici
   *   ferait exister deux `data-test="card-preview"` à la fois, ce que la
   *   recette d'interface compte.
   * - **Le menu est fermé avant l'ouverture** (`Room.tsx`). `hoverPreview`
   *   refuse en effet de s'allumer tant qu'un menu est posé dans le store — et
   *   ce sélecteur était justement rendu *par* le menu, qui restait monté
   *   derrière lui.
   *
   * On passe donc l'identifiant du **catalogue** à `hoverPreview` : l'aperçu le
   * traite comme une simple impression, sans lui inventer d'identité de jeu.
   */
  const hoverPreview = useGame((s) => s.hoverPreview);

  // Fermer la modale en laissant l'aperçu allumé montrerait une carte qu'on ne
  // désigne plus nulle part. Même règle que la recherche de jetons.
  useEffect(() => () => hoverPreview(null), [hoverPreview]);

  useEffect(() => {
    void api
      .get<{ printings: CardMeta[] }>(`/api/cards/${card.scryfallId}/printings`)
      .then((r) => setPrintings(r.printings))
      .catch(() => setPrintings([]));
  }, [card.scryfallId]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-8"
      data-test="printing-picker"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-lg border border-edge bg-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-edge px-4 py-3">
          <h2 className="font-medium">{t('printing.choose')}</h2>
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input checked={foil} type="checkbox" onChange={(event) => setFoil(event.target.checked)} />
            Foil
          </label>
        </header>

        <div className="scrollbar-thin grid max-h-[60vh] grid-cols-4 gap-3 overflow-y-auto p-4 sm:grid-cols-6">
          {printings === null && (
            <p className="col-span-full text-sm text-slate-500">{t('common.loading')}</p>
          )}
          {printings?.map((printing) => {
            const localized = localizedCard(printing.scryfallId, language);
            // Le repli est invisible : sans traduction, c'est l'anglais qui
            // s'affiche, et le motif du CDN reste le dernier recours.
            const src =
              resolveCardImage({ card: printing, localized, language, version: 'small' }).url ??
              scryfallImage(printing.scryfallId, 'small');
            const shownName = localizedCardName(localized, printing.name) ?? printing.name;
            return (
            <button
              key={printing.scryfallId}
              className={`group text-left ${printing.scryfallId === card.scryfallId ? 'ring-2 ring-sky-500' : ''}`}
              data-test="printing-option"
              onPointerEnter={() => hoverPreview(printing.scryfallId)}
              onPointerLeave={() => hoverPreview(null)}
              onClick={() => {
                hoverPreview(null);
                send({
                  type: 'SET_PRINTING',
                  cardId: card.id,
                  scryfallId: printing.scryfallId,
                  isFoil: foil,
                });
                onClose();
              }}
            >
              <img
                alt={t('printing.label', { name: shownName, setCode: printing.setCode })}
                className="w-full rounded transition group-hover:brightness-110"
                loading="lazy"
                src={src}
              />
              <p className="mt-1 truncate text-[11px] uppercase text-slate-500">
                {printing.setCode} · {printing.collectorNumber}
              </p>
            </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
