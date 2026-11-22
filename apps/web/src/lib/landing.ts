/**
 * Où poser les cartes qu'on joue sans les glisser : double-clic en main,
 * touche P, entrée « Jouer » du menu.
 *
 * Les trois chemins posaient chacun à leur façon — le menu cherchait une place
 * libre, le double-clic et P visaient le coin (60, 60), si bien qu'une main
 * jouée au clavier s'empilait sur une seule carte. Ils passent tous ici.
 *
 * Un lot reçoit des places **distinctes** : chaque place trouvée est comptée
 * comme prise avant de chercher la suivante.
 */
import type { SeatId } from '@mtg/shared';
import { useGame } from '../store/game.js';
import { freeSpot } from './drag.js';

export function landingSpots(seat: SeatId, count: number): Array<{ x: number; y: number }> {
  const occupied = [...useGame.getState().cards.values()]
    .filter((c) => c.zone.kind === 'BATTLEFIELD' && c.zone.seat === seat)
    .map((c) => ({ x: c.x, y: c.y }));
  const spots: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i += 1) {
    const spot = freeSpot(occupied);
    spots.push(spot);
    occupied.push(spot);
  }
  return spots;
}
