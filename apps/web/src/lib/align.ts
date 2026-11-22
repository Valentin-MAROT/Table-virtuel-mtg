/**
 * « Aligner » : ranger une sélection en rangées, sans jamais la faire sortir du
 * terrain.
 *
 * La première version comptait le pas sur la carte **pleine taille** alors que
 * le terrain les affiche à moitié (`BATTLEFIELD_SCALE`) : des trous d'une carte
 * entière entre deux permanents. Et rien ne bornait le bas : passé quelques
 * rangées, les cartes partaient sous le bord du panneau, qui les coupe — elles
 * semblaient avoir disparu du jeu. Retour de table, octobre 2026.
 *
 * Ce qui est rangé ici, dans l'ordre :
 *
 * 1. le pas suit la carte **telle qu'on la voit** — une carte engagée est
 *    couchée, elle prend la largeur d'une hauteur ;
 * 2. une rangée passe à la ligne au bord droit du terrain ;
 * 3. si les rangées ne tiennent pas sous l'ancre, le bloc remonte ; s'il ne
 *    tient toujours pas, les cartes **se chevauchent** dans la rangée plutôt
 *    que de sortir du cadre — une carte à moitié couverte se voit encore, une
 *    carte hors du panneau ne se voit plus ;
 * 4. une carte attachée (aura, équipement) n'est pas rangée : elle se rend sous
 *    son porteur et le suit, lui donner une place laisserait un trou.
 *
 * Fonction pure : elle rend des coordonnées, l'appelant envoie les intents.
 */
import type { CardView, ObjectId } from '@mtg/shared';
import { BATTLEFIELD_BOUNDS, LAND_SLOT_H, LAND_SLOT_W } from './landLayout.js';

/** L'air entre deux cartes rangées : assez pour les distinguer, pas plus. */
export const ALIGN_GAP = 6;

type Alignable = Pick<CardView, 'id' | 'x' | 'y' | 'tapped' | 'rotation' | 'attachedTo'>;

/** Couchée : engagée, ou tournée d'un quart de tour. */
function sideways(card: Alignable): boolean {
  return card.tapped || Math.abs(card.rotation ?? 0) % 180 === 90;
}

/** Encombrement visible d'une carte, en unités du terrain. */
function footprint(card: Alignable): { w: number; h: number } {
  return sideways(card) ? { w: LAND_SLOT_H, h: LAND_SLOT_W } : { w: LAND_SLOT_W, h: LAND_SLOT_H };
}

/**
 * Coordonnées à envoyer pour que le **rectangle visible** commence en (left,
 * top). Une carte couchée tourne autour de son centre : son coin visible n'est
 * pas son `x, y`.
 */
function origin(card: Alignable, left: number, top: number): { x: number; y: number } {
  const shift = sideways(card) ? (LAND_SLOT_H - LAND_SLOT_W) / 2 : 0;
  return { x: Math.round(left + shift), y: Math.round(top - shift) };
}

/** Coin visible actuel d'une carte : l'inverse d'`origin`. */
function visibleCorner(card: Alignable): { left: number; top: number } {
  const shift = sideways(card) ? (LAND_SLOT_H - LAND_SLOT_W) / 2 : 0;
  return { left: card.x - shift, top: card.y + shift };
}

export function alignPositions(
  cards: readonly Alignable[],
  bounds: { width: number; height: number } = BATTLEFIELD_BOUNDS,
): Map<ObjectId, { x: number; y: number }> {
  const placed = new Map<ObjectId, { x: number; y: number }>();
  const chosen = cards.filter((c) => !c.attachedTo);
  if (chosen.length === 0) return placed;

  // Ordre de lecture : par bandes horizontales, puis de gauche à droite. Une
  // bande commence à la plus haute carte restante et prend tout ce qui débute à
  // moins d'une demi-carte en dessous — des frontières fixes (`round(top / h)`)
  // coupaient en deux une rangée à peine de travers.
  const byTop = [...chosen].sort((a, b) => visibleCorner(a).top - visibleCorner(b).top);
  const ordered: Alignable[] = [];
  for (let i = 0; i < byTop.length; ) {
    const start = visibleCorner(byTop[i]!).top;
    let j = i;
    while (j < byTop.length && visibleCorner(byTop[j]!).top - start < LAND_SLOT_H / 2) j += 1;
    ordered.push(...byTop.slice(i, j).sort((a, b) => visibleCorner(a).left - visibleCorner(b).left));
    i = j;
  }

  const rowHeight = LAND_SLOT_H + ALIGN_GAP;
  const maxRows = Math.max(1, Math.floor((bounds.height + ALIGN_GAP) / rowHeight));

  /** Répartit en rangées à partir de `left`, au pas naturel. */
  const pack = (left: number): Alignable[][] => {
    const rows: Alignable[][] = [[]];
    let cursor = left;
    for (const card of ordered) {
      const { w } = footprint(card);
      const row = rows[rows.length - 1]!;
      if (row.length > 0 && cursor + w > bounds.width) {
        rows.push([card]);
        cursor = left + w + ALIGN_GAP;
      } else {
        row.push(card);
        cursor += w + ALIGN_GAP;
      }
    }
    return rows;
  };

  const corners = ordered.map(visibleCorner);
  const anchorLeft = Math.max(0, Math.min(...corners.map((c) => c.left)));
  const anchorTop = Math.max(0, Math.min(...corners.map((c) => c.top)));

  // On garde l'ancre si l'on peut ; sinon on repart du bord gauche.
  let left = anchorLeft;
  let rows = pack(left);
  if (rows.length > maxRows) {
    left = 0;
    rows = pack(0);
  }

  if (rows.length > maxRows) {
    // Plus de place au pas naturel : autant de rangées que le terrain en tient,
    // et des cartes qui se chevauchent pour tenir en largeur.
    const perRow = Math.ceil(ordered.length / maxRows);
    rows = [];
    for (let i = 0; i < ordered.length; i += perRow) rows.push(ordered.slice(i, i + perRow));
  }

  // Le bloc commence à l'ancre, et remonte juste assez pour tenir en entier.
  const blockHeight = rows.length * rowHeight - ALIGN_GAP;
  const top = Math.max(0, Math.min(anchorTop, bounds.height - blockHeight));

  rows.forEach((row, r) => {
    const natural = row.reduce((sum, c) => sum + footprint(c).w + ALIGN_GAP, -ALIGN_GAP);
    const room = bounds.width - left;
    // Chevauchement uniforme quand la rangée déborde : le dernier bord tombe
    // pile sur le bord du terrain.
    const squeeze =
      natural > room && row.length > 1 ? (natural - room) / (row.length - 1) : 0;
    let cursor = left;
    for (const card of row) {
      placed.set(card.id, origin(card, cursor, top + r * rowHeight));
      cursor += footprint(card).w + ALIGN_GAP - squeeze;
    }
  });
  return placed;
}
