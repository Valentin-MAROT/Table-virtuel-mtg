/**
 * Ce qui s'affiche quand la partie s'arrête.
 *
 * Une fin de partie était jusqu'ici une ligne de journal parmi d'autres : l'hôte
 * cloturait, et les autres joueurs continuaient de cliquer sans comprendre
 * pourquoi plus rien ne répondait. On le dit donc franchement, en plein écran.
 *
 * Après une partie *terminée*, le voile se referme : on veut pouvoir regarder le
 * terrain une dernière fois, commenter, compter les dégâts. Après une table
 * *close*, non — il n'y a plus rien à y faire, le serveur refuse jusqu'au
 * mouvement de curseur, et laisser croire le contraire était le défaut qu'on
 * corrige ici.
 */
import { Link } from 'react-router-dom';
import { TREACHERY_ROLES, treacheryIdentity, treacheryTeam, type TreacheryRole } from '@mtg/shared';
import { useGame } from '../store/game.js';
import { useT } from '../lib/i18n/index.js';
import { IdentityButton } from './TreacheryPanel.js';

export function TableClosed(): React.ReactElement | null {
  const gameOver = useGame((s) => s.gameOver);
  const seats = useGame((s) => s.seats);
  const closed = useGame((s) => s.room?.closed ?? false);
  const dismiss = useGame((s) => s.dismissGameOver);
  const roomCode = useGame((s) => s.roomCode);
  const treachery = useGame((s) => s.treachery);
  const t = useT();
  // Une table close reste annoncée même après rechargement : l'information ne
  // vient plus d'un event qu'on aurait pu manquer, mais de l'état de la room.
  if (!gameOver && !closed) return null;

  const winner = seats.find((s) => gameOver?.winners.includes(s.id));
  const title = closed ? 'Table close' : 'Partie terminée';
  // Treachery se gagne par équipe : c'est elle qu'on annonce, et le détail de
  // qui était qui vient dessous. Une table close reste une table close.
  const byTeam = !closed && treachery && gameOver?.reason === 'CONCEDE';
  const detail = closed
    ? "L'hôte a clos la table. Plus rien ne s'y joue, et l'on ne s'y rassoit pas."
    : byTeam
      ? t(`treachery.win.${gameOver?.team ?? 'none'}`)
      : winner
        ? `${winner.displayName} reste seul en lice.`
        : 'Il ne reste plus de joueur en lice.';
  const recap = byTeam
    ? [...treachery.identities.values()].sort(
        (a, b) => TREACHERY_ROLES.indexOf(a.role) - TREACHERY_ROLES.indexOf(b.role),
      )
    : [];
  const won = (role: TreacheryRole, seat: string): boolean =>
    gameOver?.team !== undefined &&
    treacheryTeam(role) === gameOver.team &&
    // Deux Traîtres ne sont pas alliés : un seul des deux a gagné.
    (gameOver.team !== 'TRAITOR' || gameOver.winners.includes(seat));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60">
      <div className="w-[min(28rem,90vw)] rounded border border-edge bg-panel p-6 text-center shadow-2xl">
        <h2 className="text-xl font-semibold text-slate-100">{title}</h2>
        <p className="mt-2 text-sm text-slate-400" data-test="game-over-detail">{detail}</p>
        {recap.length > 0 && (
          <div className="mt-4 text-left" data-test="treachery-recap">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {t('treachery.recap')}
            </div>
            <ul className="mt-1.5 space-y-1">
              {recap.map((identity) => (
                <li className="flex items-center gap-2 text-sm" key={identity.seat}>
                  <IdentityButton identity={identity} />
                  <span className="min-w-0 flex-1 truncate text-slate-200">
                    {identity.displayName}
                    <span className="ml-1.5 text-xs text-slate-500">
                      {treacheryIdentity(identity.cardId)?.name}
                    </span>
                  </span>
                  {won(identity.role, identity.seat) && (
                    <span className="shrink-0 text-xs font-semibold text-emerald-400">
                      {t('treachery.winner')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {/* Une partie finie se commente encore autour du terrain ; une table
              close, non — il n'y a plus rien à y faire, et laisser croire le
              contraire est précisément ce qu'on corrige. */}
          {!closed && (
            <button
              className="rounded border border-edge px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
              onClick={dismiss}
              type="button"
            >
              Regarder le terrain
            </button>
          )}
          {/*
            Le seul chemin qui mène au lecteur depuis la table.

            Sans lui, le replay existait sans que personne ne puisse le trouver :
            il ne s'atteignait qu'en tapant son adresse à la main. C'est ici qu'il
            a sa place — au moment précis où la partie vient de finir et où l'on a
            envie de la revoir. Le lecteur porte son propre verrou et répond « pas
            de replay » tant que la partie court, donc proposer le lien n'ouvre
            rien : c'est le serveur qui décide, pas ce bouton.
          */}
          {roomCode && (
            <Link
              className="rounded border border-edge px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
              to={`/rooms/${roomCode}/replay`}
            >
              Revoir la partie
            </Link>
          )}
          <Link
            className="rounded border border-edge bg-slate-800 px-4 py-2 text-sm text-slate-100 hover:border-slate-500"
            to="/tables"
          >
            Mes tables
          </Link>
        </div>
      </div>
    </div>
  );
}
