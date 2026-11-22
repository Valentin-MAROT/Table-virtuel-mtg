/**
 * Le tour, côté gestes : début de tour en un clic, étape suivante.
 *
 * Rien ne s'enclenche tout seul (protocol §1.1). Le début de tour est un
 * **bouton** — le joueur dégage et pioche quand il le décide, et le chemin
 * manuel (U, D) reste entier. Il ne fait que réunir les trois gestes qu'on
 * enchaîne à chaque tour : les parties réelles comptent plus d'un millier de
 * pioches d'une carte et une centaine de « tout dégager », presque toujours
 * collés au passage de tour.
 */
import { PHASES, type Intent, type PhaseName } from '@mtg/shared';
import { useGame } from '../store/game.js';

/**
 * Pioche-t-on à ce début de tour ? Non au tout premier tour d'une partie à
 * deux (règle 103.8a) ; oui en multijoueur, où le premier joueur pioche.
 */
export function drawsThisTurn(turnNumber: number, playingSeats: number): boolean {
  return !(turnNumber === 1 && playingSeats === 2);
}

/** Le bouton s'offre au joueur actif, tant qu'il n'a pas quitté le dégagement. */
export function offersStartOfTurn(): boolean {
  const { turn, mySeat, room } = useGame.getState();
  return room?.status === 'PLAYING' && mySeat !== null && turn.activeSeat === mySeat && turn.phase === 'UNTAP';
}

export function startOfTurnIntents(): Intent[] {
  const { turn, seats, mySeat } = useGame.getState();
  if (!mySeat) return [];
  const playing = seats.filter((s) => !s.conceded).length;
  return [
    { type: 'UNTAP_ALL', seat: mySeat },
    ...(drawsThisTurn(turn.turnNumber, playing) ? [{ type: 'DRAW', count: 1 } as Intent] : []),
    { type: 'SET_PHASE', phase: 'MAIN1' },
  ];
}

/** L'étape d'après ; après la fin du tour, il n'y a plus que « passer le tour ». */
export function nextPhase(phase: PhaseName): PhaseName | null {
  const i = PHASES.indexOf(phase);
  return i >= 0 && i < PHASES.length - 1 ? PHASES[i + 1]! : null;
}
