/**
 * Treachery : son identité, la répartition des rôles, les identités visibles.
 *
 * Le panneau ne montre que ce que le serveur a envoyé à **ce** client : sa
 * propre carte, et celles qui sont face visible. Une identité encore secrète
 * n'est pas « masquée » ici — elle n'est pas là du tout, et l'on n'en affiche
 * que le compte, que toute la table connaît.
 *
 * La carte d'identité s'affiche avec son **image officielle**, chargée par le
 * navigateur depuis mtgtreachery.net — jamais copiée ni servie par nous, comme
 * les faces de cartes chez Scryfall — et son illustrateur est crédité dessous.
 * Le texte reste écrit à côté : il se lit sans l'image, il se sélectionne, et
 * c'est lui qui reste si l'image ne vient pas. Voir
 * `packages/shared/src/treachery/identities.ts`.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  TREACHERY_MAX_SEATS,
  TREACHERY_MIN_SEATS,
  TREACHERY_ROLES,
  treacheryDistribution,
  treacheryIdentity,
  type TreacheryIdentityView,
  type TreacheryRole,
} from '@mtg/shared';
import { useGame } from '../store/game.js';
import { useT } from '../lib/i18n/index.js';
import { ROLE_TINT, distributionText, roleName } from '../lib/treachery.js';
import { askConfirm } from './Dialog.js';

/** L'étiquette d'un rôle : teinte **et** nom, toujours les deux. */
export function RoleTag({ role, small }: { role: TreacheryRole; small?: boolean }): React.ReactElement {
  const t = useT();
  const tint = ROLE_TINT[role];
  return (
    <span
      className={`shrink-0 rounded border font-semibold uppercase tracking-wide ${
        small ? 'px-1 py-px text-[9px]' : 'px-1.5 py-0.5 text-[10px]'
      }`}
      data-role={role}
      data-test="role-tag"
      style={{ color: tint.text, borderColor: tint.border, background: tint.bg }}
    >
      {roleName(t, role)}
    </span>
  );
}

/**
 * L'étiquette d'un rôle, cliquable : elle ouvre la carte d'identité.
 *
 * C'est par elle qu'on lit la carte d'un autre joueur, là où son nom est déjà
 * écrit — l'ordre du tour, le bilan de fin de partie. Une liste à part des
 * « identités visibles » redisait ce que l'ordre du tour montre déjà, et
 * prenait dans la colonne la place du journal.
 */
export function IdentityButton({
  identity,
}: {
  identity: TreacheryIdentityView;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const live = useGame((s) => s.treachery?.identities.get(identity.seat)) ?? identity;
  return (
    <>
      <button
        className="shrink-0 leading-none"
        data-seat={identity.seat}
        data-test="known-identity"
        onClick={() => setOpen(true)}
        title={treacheryIdentity(identity.cardId)?.name}
        type="button"
      >
        <RoleTag role={identity.role} small />
      </button>
      {open && <IdentityCardModal identity={live} onClose={() => setOpen(false)} />}
    </>
  );
}

/** La carte d'identité, en grand, lisible par qui a le droit de la voir. */
export function IdentityCardModal({
  identity,
  onClose,
}: {
  identity: TreacheryIdentityView;
  onClose: () => void;
}): React.ReactElement {
  const t = useT();
  const card = treacheryIdentity(identity.cardId);
  const tint = ROLE_TINT[identity.role];
  // L'image vient d'un site tiers : s'il ne répond pas, la carte reste lisible
  // par son texte, et l'on retire le cadre vide plutôt que de montrer une
  // image cassée.
  const [imageFailed, setImageFailed] = useState(false);
  const withImage = Boolean(card) && !imageFailed;

  // Échap ferme la carte, comme toute autre fenêtre de la table.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Par portail : le panneau qui l'ouvre porte un `backdrop-filter`, et un
  // ancêtre filtré devient le repère de ses descendants `fixed` — la carte se
  // serait affichée dans les 288 pixels de la colonne.
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
      data-test="identity-card-modal"
      onClick={onClose}
      role="presentation"
    >
      <div
        aria-modal="true"
        className={`max-h-[90vh] overflow-y-auto rounded-xl border-2 bg-slate-950 p-5 shadow-2xl ${
          withImage ? 'w-[min(46rem,100%)] sm:flex sm:gap-5' : 'w-[min(26rem,100%)]'
        }`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        style={{ borderColor: tint.border }}
      >
        {card && withImage && (
          <figure className="mx-auto mb-4 w-[min(19rem,100%)] shrink-0 sm:mb-0">
            <img
              alt={t('treachery.cardImageAlt', { name: card.name })}
              className="w-full rounded-[4.5%] shadow-lg"
              data-test="identity-card-image"
              onError={() => setImageFailed(true)}
              // Le site d'origine n'a pas à savoir quelle table on joue.
              referrerPolicy="no-referrer"
              src={card.image}
            />
            <figcaption className="mt-1.5 text-[11px] leading-snug text-slate-500">
              {t('treachery.cardArtist', { artist: card.artist })}
            </figcaption>
          </figure>
        )}
        <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold leading-tight text-slate-50" data-test="identity-card-name">
            {card?.name ?? roleName(t, identity.role)}
          </h2>
          <RoleTag role={identity.role} />
        </div>
        <p className="mt-1 text-xs text-slate-400">
          {t('treachery.cardType', { role: roleName(t, identity.role) })}
          {card && ` · ${t(`treachery.rarity.${card.rarity}`)}`}
          {` · ${identity.displayName}`}
        </p>

        <p className="mt-3 rounded border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs leading-relaxed text-slate-300">
          {t(`treachery.goal.${identity.role}`)}
        </p>

        {card && (
          <>
            {/* Le texte d'origine, dans sa langue : `lang` pour qu'un lecteur
                d'écran ne le prononce pas à la française. */}
            <div className="mt-3 space-y-2 text-sm leading-relaxed text-slate-100" lang="en">
              {card.text.split('\n').map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-slate-500">{t('treachery.cardEnglish')}</p>
            <a
              className="mt-1 inline-block text-xs text-sky-400 underline hover:text-sky-300"
              href={card.uri}
              rel="noreferrer noopener"
              target="_blank"
            >
              {t('treachery.cardSource')}
            </a>
          </>
        )}

        <p className="mt-3 border-t border-slate-800 pt-3 text-[11px] leading-relaxed text-slate-500">
          {t('treachery.cardCredit')}
        </p>
        {/*
          Collé au bas de la fenêtre : sur un écran court le texte de la carte
          défile, et le bouton partait avec lui, sous le pli — on ouvrait sa
          carte sans voir comment la refermer.
        */}
        <div className="sticky -bottom-5 -mb-5 mt-4 bg-slate-950 pb-5 pt-2 text-right">
          <button
            className="rounded border border-slate-700 px-4 py-1.5 text-sm text-slate-200 hover:border-slate-500"
            data-test="identity-card-close"
            onClick={onClose}
            type="button"
          >
            {t('treachery.close')}
          </button>
        </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function TreacheryPanel(): React.ReactElement | null {
  const t = useT();
  const mode = useGame((s) => s.room?.mode);
  const status = useGame((s) => s.room?.status);
  const seats = useGame((s) => s.seats);
  const mySeat = useGame((s) => s.mySeat);
  const treachery = useGame((s) => s.treachery);
  const send = useGame((s) => s.send);
  const [shown, setShown] = useState<TreacheryIdentityView | null>(null);
  const [open, setOpen] = useState(true);

  if (mode !== 'TREACHERY') return null;

  const frame =
    'pointer-events-auto rounded-xl border border-slate-700 bg-slate-900/90 p-2.5 text-sm shadow-xl backdrop-blur-md';
  const heading = (
    <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
      {t('treachery.title')}
    </div>
  );

  // Avant la distribution : ce qu'il faut pour lancer, et ce qui sera tiré.
  if (!treachery) {
    if (status === 'PLAYING') return null;
    const count = seats.length;
    const deal = treacheryDistribution(count);
    return (
      <div className={frame} data-test="treachery-panel">
        {heading}
        <p className="text-xs leading-relaxed text-slate-300">{t('treachery.lobbyRange')}</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-400" data-test="treachery-lobby">
          {deal
            ? t('treachery.lobbyDeal', { count, roles: distributionText(t, deal) })
            : count < TREACHERY_MIN_SEATS
              ? t('treachery.lobbyNeed', { count: TREACHERY_MIN_SEATS - count })
              : null}
        </p>
      </div>
    );
  }

  const mine = mySeat ? treachery.identities.get(mySeat) : undefined;
  const myCard = mine ? treacheryIdentity(mine.cardId) : undefined;
  const total = TREACHERY_ROLES.reduce((sum, role) => sum + treachery.distribution[role], 0);
  const secret = Math.max(0, total - treachery.identities.size);

  async function unveil(): Promise<void> {
    const yes = await askConfirm(t('treachery.unveilConfirmTitle'), {
      description: t('treachery.unveilConfirmBody'),
      submitLabel: t('treachery.unveil'),
    });
    if (yes) send({ type: 'UNVEIL' });
  }

  return (
    <div className={frame} data-test="treachery-panel">
      {/*
        Repliable : la colonne porte aussi l'ordre du tour et le journal, et à
        huit joueurs elle n'a plus un pixel à perdre. Replié, le panneau garde
        l'essentiel — son rôle — sur une ligne.
      */}
      <button
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
        data-test="treachery-toggle"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {t('treachery.title')}
        </span>
        <span className="flex items-center gap-1.5">
          {!open && mine && <RoleTag role={mine.role} small />}
          <span aria-hidden className="text-[10px] text-slate-500">
            {open ? '▾' : '▸'}
          </span>
        </span>
      </button>

      {open && (
        <p
          className="mt-1 text-[11px] leading-snug text-slate-400"
          data-test="treachery-distribution"
        >
          {distributionText(t, treachery.distribution)}
          {secret > 0 && (
            <span data-test="treachery-secret-count">
              {' · '}
              {t('treachery.stillSecret', { count: secret })}
            </span>
          )}
        </p>
      )}

      {open && mine && (
        <div
          className="mt-2 rounded-lg border px-2 py-1.5"
          data-test="my-identity"
          data-unveiled={mine.unveiled}
          style={{ borderColor: ROLE_TINT[mine.role].border }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate font-semibold text-slate-100" title={myCard?.name}>
              {myCard?.name ?? roleName(t, mine.role)}
            </span>
            <RoleTag role={mine.role} />
          </div>
          <div className="text-[11px] text-slate-400">
            {mine.unveiled ? t('treachery.unveiled') : t('treachery.secret')}
          </div>
          <div className="mt-1.5 flex gap-1.5">
            <button
              className="flex-1 rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-slate-500"
              data-test="see-my-identity"
              onClick={() => setShown(mine)}
              type="button"
            >
              {t('treachery.seeCard')}
            </button>
            {!mine.unveiled && status === 'PLAYING' && (
              <button
                className="flex-1 rounded bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-900 hover:bg-white"
                data-test="unveil"
                onClick={() => void unveil()}
                type="button"
              >
                {t('treachery.unveil')}
              </button>
            )}
          </div>
        </div>
      )}

      {shown && (
        <IdentityCardModal
          // La carte affichée suit l'état : dévoilée pendant qu'on la lit, elle
          // doit le dire.
          identity={treachery.identities.get(shown.seat) ?? shown}
          onClose={() => setShown(null)}
        />
      )}
    </div>
  );
}

/** Bornes de la table, pour qui doit dire « il manque du monde ». */
export function treacheryCanStart(count: number): boolean {
  return count >= TREACHERY_MIN_SEATS && count <= TREACHERY_MAX_SEATS;
}
