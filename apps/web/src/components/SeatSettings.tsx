/**
 * Réglages du siège : playmat, dos de carte, et disposition des terrains.
 *
 * Deux sources pour les cosmétiques : les playmats enregistrés sur le compte
 * (`/api/me`, créés par `/api/me/playmats`) et une URL libre, pour qui joue en
 * invité. Rien n'est appliqué localement — on envoie `SET_SEAT_COSMETICS` et on
 * attend l'event.
 *
 * Aucune image n'est hébergée ni redistribuée par ce projet : le navigateur va
 * chercher celle dont le joueur donne l'adresse.
 *
 * La disposition des terrains, elle, ne passe pas par la partie : c'est une
 * préférence de joueur (`UserPrefs.extra`, repli `localStorage`), qui ne
 * produit d'intent qu'au moment où l'on clique sur « Aligner les terrains ».
 */
import { useEffect, useRef, useState } from 'react';
import { api, type Me } from '../lib/api.js';
import { useGame } from '../store/game.js';
import { useCloseOnEscape } from '../lib/overlay.js';
import { useT } from '../lib/i18n/index.js';
import {
  BATTLEFIELD_BOUNDS,
  DEFAULT_LAND_LAYOUT,
  LAND_OVERLAP_MAX,
  LAND_SIZE_RANGE,
  LAND_SLOT_H,
  LAND_SLOT_W,
  landSlots,
  loadLandLayout,
  saveLandLayout,
  sanitizeLandLayout,
  type LandAnchor,
  type LandLayout,
  type LandShape,
} from '../lib/landLayout.js';

/** Les quatre coins, dans l'ordre où ils se lisent sur la vignette d'aperçu. */
const ANCHOR_LABELS: ReadonlyArray<readonly [LandAnchor, string]> = [
  ['top-left', 'Haut gauche'],
  ['top-right', 'Haut droite'],
  ['bottom-left', 'Bas gauche'],
  ['bottom-right', 'Bas droite'],
];

/** Les quatre formes, et le nom court sous lequel le joueur les choisit. */
const SHAPE_LABELS: ReadonlyArray<readonly [LandShape, string]> = [
  ['rows', 'Rangées'],
  ['grid', 'Grille'],
  ['piles-by-type', 'Piles par type'],
  ['piles-fixed', 'Piles fixes'],
];

/**
 * Ce que le nombre réglable veut dire, forme par forme.
 *
 * Le même bouton « 4 » signifie quatre rangées, quatre colonnes ou quatre
 * cartes par pile : un libellé figé mentirait aux deux tiers des réglages.
 * `piles-by-type` n'a pas de nombre — la taille des piles est celle du jeu —,
 * et l'absence de titre est ici l'information : le sélecteur disparaît.
 */
const SIZE_LABELS: Readonly<Record<LandShape, string | null>> = {
  rows: 'Rangées, au plus',
  grid: 'Colonnes, au plus',
  'piles-by-type': null,
  'piles-fixed': 'Cartes par pile',
};

/**
 * Les terrains figurés dans l'aperçu : vingt cartes, cinq noms.
 *
 * Vingt et non cinq : le réglage ne se comprend qu'au moment où une rangée
 * déborde et où la seconde s'ouvre. Avec cinq terrains, les quatre ancrages se
 * ressemblent et le nombre de rangées ne change rien — l'aperçu montrerait
 * précisément le cas où le réglage ne sert pas.
 *
 * Cinq noms, et distribués en tournant plutôt qu'à la suite : « Piles par
 * type » ne se comprend que si les noms arrivent **mêlés**, comme les terrains
 * arrivent en partie. Un aperçu où les quatre Plaines seraient déjà voisines
 * dans l'entrée montrerait un groupement qui n'a rien groupé.
 */
const PREVIEW_LANDS: ReadonlyArray<{ key: string }> = Array.from({ length: 20 }, (_, rank) => ({
  key: ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'][rank % 5]!,
}));
/** Largeur de la vignette, en pixels. Le reste en découle par le rapport du panneau. */
const PREVIEW_WIDTH = 240;

export function SeatSettings({ onClose }: { onClose: () => void }): React.ReactElement {
  const t = useT();
  const send = useGame((s) => s.send);
  const mySeat = useGame((s) => s.mySeat);
  const seats = useGame((s) => s.seats);
  const me = seats.find((s) => s.id === mySeat);

  const [account, setAccount] = useState<Me | null>(null);
  const [playmatUrl, setPlaymatUrl] = useState(me?.playmatUrl ?? '');
  const [cardBackUrl, setCardBackUrl] = useState(me?.cardBackUrl ?? '');
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [landLayout, setLandLayout] = useState<LandLayout>(DEFAULT_LAND_LAYOUT);
  /**
   * Le joueur a-t-il déjà touché au réglage ?
   *
   * `loadLandLayout` passe par le réseau quand on a un compte, et peut donc
   * répondre *après* un premier clic. Sans ce garde-fou, la réponse écraserait
   * le choix qu'on vient de faire, sous les yeux de celui qui le fait — et le
   * réglage enregistré ne correspondrait plus à ce que l'écran affiche.
   */
  const touched = useRef(false);
  useCloseOnEscape(onClose);

  useEffect(() => {
    void api
      .get<Me>('/api/me')
      .then(setAccount)
      .catch(() => setAccount(null));
  }, []);

  useEffect(() => {
    void loadLandLayout().then((loaded) => {
      if (!touched.current) setLandLayout(loaded);
    });
  }, []);

  /** Un réglage changé part tout de suite : il n'y a pas de bouton « Appliquer » ici. */
  function changeLandLayout(patch: Partial<LandLayout>): void {
    touched.current = true;
    const next = sanitizeLandLayout({ ...landLayout, ...patch });
    setLandLayout(next);
    void saveLandLayout(next);
  }

  /*
   * L'intervalle du nombre suit la forme, et le changement de forme réassainit
   * le nombre au passage : `changeLandLayout` passe par `sanitizeLandLayout`,
   * qui borne `size` aux valeurs de la **nouvelle** forme. C'est ce qui évite
   * un bouton « 8 » allumé alors que la forme retenue s'arrête à quatre.
   */
  const sizeRange = LAND_SIZE_RANGE[landLayout.shape];
  const sizeLabel = SIZE_LABELS[landLayout.shape];
  const sizes = Array.from(
    { length: sizeRange.max - sizeRange.min + 1 },
    (_, index) => sizeRange.min + index,
  );

  function apply(next: { playmatUrl?: string | null; cardBackUrl?: string | null }): void {
    send({ type: 'SET_SEAT_COSMETICS', ...next });
  }

  async function savePlaymat(): Promise<void> {
    setError(null);
    try {
      await api.post('/api/me/playmats', { name: newName.trim(), imageUrl: playmatUrl.trim() });
      setNewName('');
      setAccount(await api.get<Me>('/api/me'));
    } catch {
      setError("Enregistrement impossible : il faut un compte, un nom et une URL d'image valides.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg border border-edge bg-panel p-5"
        data-test="seat-settings"
        onClick={(event) => event.stopPropagation()}
      >
        {/*
          **Le titre ne nomme plus son contenu, il nomme son périmètre.**

          Cette modale s'appelait « Playmat et dos de carte » tant qu'elle ne
          réglait que cela. Elle porte désormais aussi la disposition des
          terrains, et un titre qui énumère finit par mentir au prochain ajout —
          c'est précisément ce qui venait d'arriver : le réglage des terrains
          vivait derrière un libellé qui ne l'annonçait pas, donc introuvable
          pour qui le cherchait.

          Les trois endroits qui ouvrent cette modale — l'engrenage de la barre
          du haut, l'entrée du menu « Actions », et ce titre — lisent maintenant
          la **même** clé de catalogue. Elle existait déjà et n'était employée
          nulle part : les trois libellés étaient écrits en dur, et divergeaient
          donc à la première retouche.
        */}
        <h2 className="mb-4 font-medium">{t('toolbar.playmat')}</h2>

        {account && account.playmats.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Vos playmats</p>
            <div className="grid grid-cols-3 gap-2">
              {account.playmats.map((playmat) => (
                <button
                  key={playmat.id}
                  className="overflow-hidden rounded border border-edge hover:border-sky-500"
                  onClick={() => {
                    setPlaymatUrl(playmat.imageUrl);
                    apply({ playmatUrl: playmat.imageUrl });
                  }}
                  title={playmat.name}
                >
                  <img alt={playmat.name} className="h-16 w-full object-cover" src={playmat.imageUrl} />
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="mb-3 block text-sm text-slate-400">
          URL du playmat
          <input
            className="mt-1 w-full rounded border border-edge bg-table px-3 py-2 text-sm text-slate-200"
            placeholder="https://…"
            value={playmatUrl}
            onChange={(event) => setPlaymatUrl(event.target.value)}
          />
        </label>

        <div className="mb-4 flex gap-2">
          <button
            className="rounded bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-white"
            onClick={() => apply({ playmatUrl: playmatUrl.trim() || null })}
          >
            Appliquer
          </button>
          <button
            className="rounded border border-edge px-3 py-1.5 text-sm text-slate-300 hover:border-slate-500"
            onClick={() => {
              setPlaymatUrl('');
              apply({ playmatUrl: null });
            }}
          >
            Retirer
          </button>
          {account && (
            <>
              <input
                className="w-28 rounded border border-edge bg-table px-2 py-1.5 text-sm text-slate-200"
                placeholder="Nom"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
              <button
                className="rounded border border-edge px-3 py-1.5 text-sm text-slate-300 hover:border-slate-500"
                disabled={!newName.trim() || !playmatUrl.trim()}
                onClick={() => void savePlaymat()}
              >
                Enregistrer
              </button>
            </>
          )}
        </div>

        <label className="mb-3 block text-sm text-slate-400">
          URL du dos de carte
          <input
            className="mt-1 w-full rounded border border-edge bg-table px-3 py-2 text-sm text-slate-200"
            placeholder="https://…"
            value={cardBackUrl}
            onChange={(event) => setCardBackUrl(event.target.value)}
          />
        </label>

        <div className="mb-4 flex gap-2">
          <button
            className="rounded bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-white"
            onClick={() => apply({ cardBackUrl: cardBackUrl.trim() || null })}
          >
            Appliquer
          </button>
          <button
            className="rounded border border-edge px-3 py-1.5 text-sm text-slate-300 hover:border-slate-500"
            onClick={() => {
              setCardBackUrl('');
              apply({ cardBackUrl: null });
            }}
          >
            Dos neutre
          </button>
        </div>

        {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}
        <p className="mb-4 text-xs text-slate-500">
          Utilisez vos propres images. Ce projet n'héberge ni ne redistribue aucun visuel
          de Wizards of the Coast.
        </p>

        <div className="mb-4 border-t border-edge pt-4" data-test="land-layout">
          <h3 className="mb-1 font-medium">Disposition des terrains</h3>
          <p className="mb-3 text-xs text-slate-500">
            Utilisée par « Aligner les terrains », dans le menu Actions.
          </p>

          <LandLayoutPreview layout={landLayout} />

          <p className="mb-1 mt-3 text-xs uppercase tracking-wide text-slate-500">Forme</p>
          <div className="mb-3 grid grid-cols-2 gap-2">
            {SHAPE_LABELS.map(([shape, label]) => (
              <button
                key={shape}
                className={`rounded border py-1.5 text-sm ${
                  landLayout.shape === shape
                    ? 'border-sky-500 bg-sky-950/60 text-sky-200'
                    : 'border-edge text-slate-300 hover:border-slate-500'
                }`}
                data-test={`land-shape-${shape}`}
                onClick={() => changeLandLayout({ shape })}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          {sizeLabel && (
            <>
              <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">{sizeLabel}</p>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {/*
                  Des boutons plutôt qu'un champ numérique : il n'y a jamais
                  plus de neuf valeurs — les piles, de 2 à 10 —, et l'aperçu
                  au-dessus répond à chaque clic. Le pavé numérique
                  n'apporterait qu'une saisie à corriger. La largeur minimale
                  et le retour à la ligne vont ensemble : plutôt qu'une rangée
                  de boutons rétrécis au point qu'on les manque du doigt, on
                  accepte qu'ils passent sur deux lignes si la modale se
                  resserre.
                */}
                {sizes.map((size) => (
                  <button
                    key={size}
                    className={`min-w-[2.25rem] flex-1 rounded border py-1.5 text-sm ${
                      landLayout.size === size
                        ? 'border-sky-500 bg-sky-950/60 text-sky-200'
                        : 'border-edge text-slate-300 hover:border-slate-500'
                    }`}
                    data-test={`land-size-${size}`}
                    onClick={() => changeLandLayout({ size })}
                    type="button"
                  >
                    {size}
                  </button>
                ))}
              </div>
            </>
          )}

          <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">Coin de départ</p>
          <div className="mb-3 grid grid-cols-2 gap-2">
            {ANCHOR_LABELS.map(([anchor, label]) => (
              <button
                key={anchor}
                className={`rounded border py-1.5 text-sm ${
                  landLayout.anchor === anchor
                    ? 'border-sky-500 bg-sky-950/60 text-sky-200'
                    : 'border-edge text-slate-300 hover:border-slate-500'
                }`}
                data-test={`land-anchor-${anchor}`}
                onClick={() => changeLandLayout({ anchor })}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          <label className="block text-xs uppercase tracking-wide text-slate-500">
            Chevauchement · {Math.round(landLayout.overlap * 100)} %
            <input
              className="mt-1 w-full accent-sky-500"
              data-test="land-overlap"
              max={LAND_OVERLAP_MAX}
              min={0}
              onChange={(event) => changeLandLayout({ overlap: Number(event.target.value) })}
              step={0.05}
              type="range"
              value={landLayout.overlap}
            />
          </label>
        </div>

        <button
          className="w-full rounded border border-edge py-1.5 text-sm hover:border-slate-500"
          onClick={onClose}
        >
          Fermer
        </button>
      </div>
    </div>
  );
}

/**
 * Vignette d'aperçu : le panneau réduit, et vingt terrains posés dedans.
 *
 * Elle appelle la **même** `landSlots` que l'action, à l'échelle près : un
 * aperçu qui redessinerait la disposition à sa façon finirait par mentir le
 * jour où la géométrie change, et c'est exactement le genre de mensonge qu'on
 * ne remarque pas. C'est aussi ce qui fait que les quatre formes s'y montrent
 * sans une ligne de dessin de plus. Le rapport du panneau est conservé, sans
 * quoi un chevauchement de 40 % n'aurait pas l'air du même sur la vignette et
 * sur la table.
 *
 * Les rectangles sont rendus dans l'ordre des emplacements, c'est-à-dire dans
 * l'ordre d'entrée, ce qui reproduit le recouvrement réel : sur le champ de
 * bataille, tous les permanents non attachés partagent le même `zIndex` et
 * c'est l'ordre de peinture qui décide. L'aperçu des piles par type montre donc
 * aussi l'irrégularité que le groupement coûte quand deux piles se touchent.
 */
function LandLayoutPreview({ layout }: { layout: LandLayout }): React.ReactElement {
  const scale = PREVIEW_WIDTH / BATTLEFIELD_BOUNDS.width;
  const slots = landSlots(PREVIEW_LANDS, layout);

  return (
    <div
      className="relative overflow-hidden rounded border border-edge bg-table"
      style={{ width: PREVIEW_WIDTH, height: Math.round(BATTLEFIELD_BOUNDS.height * scale) }}
    >
      {slots.map((slot, rank) => (
        <div
          key={rank}
          className="absolute rounded-[1px] border border-emerald-400/70 bg-emerald-800/80"
          style={{
            left: slot.x * scale,
            top: slot.y * scale,
            width: LAND_SLOT_W * scale,
            height: LAND_SLOT_H * scale,
          }}
        />
      ))}
    </div>
  );
}
