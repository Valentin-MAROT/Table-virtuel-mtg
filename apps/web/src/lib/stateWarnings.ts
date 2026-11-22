/**
 * Ce que les règles feraient d'elles-mêmes (CR 704, actions basées sur l'état),
 * **dit** à la table et jamais fait à sa place.
 *
 * Un moteur en ligne tue la créature à 0 d'endurance et retire le joueur à
 * 10 poisons. Ici, la table s'arbitre (protocol §1.1) : on signale, et l'on
 * propose le geste — un bouton « au cimetière » — sans jamais l'envoyer seul.
 * Un avertissement à tort (un effet que l'outil ne voit pas) se masque d'un clic.
 *
 * Fonction pure : elle lit l'état et le catalogue, l'affichage est ailleurs.
 */
import type { CardView, ObjectId, SeatId, SeatSummary } from '@mtg/shared';
import { ptCounter } from '../components/CardSprite.js';

export interface StateWarning {
  /** Stable tant que la situation dure : sert à masquer un avertissement. */
  id: string;
  seat: SeatId;
  text: string;
  cardIds: ObjectId[];
  /** Le geste proposé, s'il y en a un. */
  suggest?: 'GRAVEYARD';
}

interface Meta {
  name: string;
  typeLine: string;
  toughness?: string | null;
}

/** Endurance actuelle : imprimée, plus les marqueurs ±N/±N. `null` si incalculable. */
export function currentToughness(card: CardView, meta: Meta | undefined): number | null {
  const base = Number(meta?.toughness ?? Number.NaN);
  if (!Number.isFinite(base)) return null;
  let total = base;
  for (const counter of card.counters) {
    const pt = ptCounter(counter.kind);
    if (!pt) continue;
    const r = Number(pt.right);
    // Un marqueur « X/X » fixe la valeur au lieu de l'ajuster : on ne devine pas.
    if (!/^[+-]/.test(pt.right) || !Number.isFinite(r)) return null;
    total += r * (counter.value ?? 1);
  }
  return total;
}

export function stateWarnings(
  seats: readonly SeatSummary[],
  cards: Iterable<CardView>,
  metaOf: (scryfallId: string) => Meta | undefined,
): StateWarning[] {
  const out: StateWarning[] = [];
  const name = (seat: SeatId): string => seats.find((s) => s.id === seat)?.displayName ?? '?';

  for (const seat of seats) {
    if (seat.conceded) continue;
    if (seat.life <= 0) {
      out.push({ id: `life:${seat.id}`, seat: seat.id, text: `${seat.displayName} est à ${seat.life} point de vie`, cardIds: [] });
    }
    const poison = seat.playerCounters.find((c) => c.kind === 'poison')?.value ?? 0;
    if (poison >= 10) {
      out.push({ id: `poison:${seat.id}`, seat: seat.id, text: `${seat.displayName} a ${poison} marqueurs poison`, cardIds: [] });
    }
    for (const [from, byCommander] of Object.entries(seat.commanderDamage)) {
      for (const [commanderId, damage] of Object.entries(byCommander)) {
        if (damage >= 21) {
          out.push({
            id: `cmd:${seat.id}:${commanderId}`,
            seat: seat.id,
            text: `${seat.displayName} a reçu ${damage} dégâts du commandant de ${name(from)}`,
            cardIds: [commanderId],
          });
        }
      }
    }
  }

  const legends = new Map<string, CardView[]>();
  for (const card of cards) {
    if (card.zone.kind !== 'BATTLEFIELD' || card.faceDown) continue;
    const meta = metaOf(card.scryfallId);
    if (!meta) continue;
    if (/\bCreature\b/.test(meta.typeLine)) {
      const toughness = currentToughness(card, meta);
      if (toughness !== null && toughness <= 0) {
        out.push({
          id: `toughness:${card.id}`,
          seat: card.controller,
          text: `${meta.name} a ${toughness} d'endurance`,
          cardIds: [card.id],
          suggest: 'GRAVEYARD',
        });
      }
    }
    if (/\bLegendary\b/.test(meta.typeLine)) {
      const key = `${card.controller}|${meta.name}`;
      legends.set(key, [...(legends.get(key) ?? []), card]);
    }
  }
  for (const [key, group] of legends) {
    if (group.length < 2) continue;
    const seat = group[0]!.controller;
    out.push({
      id: `legend:${key}`,
      seat,
      text: `Règle de la légende : ${name(seat)} contrôle ${group.length} × ${key.slice(key.indexOf('|') + 1)}`,
      cardIds: group.map((c) => c.id),
    });
  }
  return out;
}
