/**
 * L'annonce du tour ne suit que le direct (`turnCue`, store/game.ts).
 *
 * Un rattrapage (`hello` + `delta`) rejoue les `TURN_ENDED` manqués pendant une
 * coupure : annoncer « À vous de jouer » et faire sonner la cloche pour un tour
 * déjà commencé est exactement ce que `turnCue` promet d'éviter. Et une flèche
 * rejouée par un delta qui chevauche ne doit pas se dessiner deux fois.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { ServerMessage } from '@mtg/shared';
import { handleMessage, useGame } from '../src/store/game.js';

function apply(message: ServerMessage): void {
  handleMessage(message, useGame.setState, useGame.getState);
}

const turnEnded = (seq: number) => ({
  t: 'event' as const,
  seq,
  at: 1_000 + seq,
  actor: 'seat_1',
  event: { type: 'TURN_ENDED' as const, seat: 'seat_1', nextSeat: 'seat_0', turnNumber: 2 },
});

const arrowAdded = (seq: number) => ({
  t: 'event' as const,
  seq,
  at: 1_000 + seq,
  actor: 'seat_1',
  event: {
    type: 'ARROWS_ADDED' as const,
    arrows: [{ id: 'f1', seat: 'seat_1', kind: 'ATTACK' as const, from: 'c1', to: { seat: 'seat_0' } }],
  },
});

describe('annonce du tour et rattrapage', () => {
  beforeEach(() => {
    useGame.setState({ seq: 0, log: [], turnCue: null, arrows: [], mySeat: 'seat_0' });
  });

  it('un passage de tour en direct est annoncé', () => {
    apply(turnEnded(1));
    expect(useGame.getState().turnCue).toMatchObject({ seat: 'seat_0', turnNumber: 2 });
  });

  it('un passage de tour rejoué par le rattrapage ne l’est pas', () => {
    apply({ t: 'hello', protocol: 3, seat: 'seat_0', roomCode: 'TEST01', delta: [turnEnded(1)] } as ServerMessage);
    expect(useGame.getState().turn.activeSeat).toBe('seat_0');
    expect(useGame.getState().turnCue).toBeNull();
  });

  it('une flèche rejouée par un delta qui chevauche ne se dédouble pas', () => {
    apply(arrowAdded(1));
    apply({ t: 'hello', protocol: 3, seat: 'seat_0', roomCode: 'TEST01', delta: [arrowAdded(1)] } as ServerMessage);
    expect(useGame.getState().arrows).toHaveLength(1);
  });
});
