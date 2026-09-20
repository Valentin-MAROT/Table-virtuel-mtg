/**
 * Disposition automatique des terrains sur le champ de bataille.
 *
 * Le geste que ce module épargne est le plus répétitif de la partie : à chaque
 * terrain posé, on le traîne à la main jusqu'au bas du panneau pour qu'il
 * cesse de recouvrir les créatures. Trente-sept fois par partie de Commander.
 *
 * **La géométrie vit ici, séparée de tout composant, parce qu'elle est la seule
 * chose qui puisse être fausse silencieusement.** Une carte posée à `x = 1100`
 * dans un panneau large de 1076 n'échoue nulle part : le serveur l'accepte, le
 * client la dessine, et elle est simplement invisible — hors du cadre, sous le
 * panneau voisin. Aucune erreur, aucun log, juste un terrain qui a disparu.
 * `landSlots` est donc une fonction pure, sans React, sans store et sans
 * stockage, pour que `test/terrains-disposition.test.ts` puisse l'exercer sur
 * des centaines de combinaisons et vérifier cette invariante-là.
 *
 * **Quatre formes, un seul contrat.** Chacune répond à une façon différente de
 * lire son champ de bataille — voir `LandShape` pour ce que chacune montre et
 * ce qu'elle cache —, mais toutes rendent la même chose : un emplacement par
 * terrain, dans l'ordre reçu, et jamais un pixel hors du cadre.
 *
 * Persistance : `UserPrefs.extra` pour un compte, `localStorage` pour un
 * invité — le même partage que l'étagère à jetons, et par le même guichet
 * (`lib/accountExtra.ts`), qui existe précisément pour que deux réglages qui
 * vivent dans `extra` ne s'effacent pas l'un l'autre.
 */
import { BATTLEFIELD_SCALE, CARD_HEIGHT, CARD_WIDTH } from './cards.js';
import { readAccountExtra, writeAccountExtra } from './accountExtra.js';

/** Le coin du panneau d'où part l'éventail. */
export type LandAnchor = 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

export const LAND_ANCHORS: readonly LandAnchor[] = [
  'bottom-left',
  'bottom-right',
  'top-left',
  'top-right',
];

/**
 * La forme de l'éventail, et ce que chacune échange contre quoi.
 *
 * - `rows` — **rangées.** Chevauchement horizontal : de chaque terrain on voit
 *   la tranche du côté de l'ancre, soit le nom et le coût. C'est la forme la
 *   plus lisible carte par carte, et la plus gourmande en largeur.
 * - `grid` — **grille resserrée.** Colonnes jointives, chevauchement vertical :
 *   de chaque terrain on ne voit plus que le haut — nom et début
 *   d'illustration. La forme la plus économe en place, et celle qui rend le
 *   compte d'un type difficile à faire d'un coup d'œil.
 * - `piles-by-type` — **piles par type.** Une pile par nom de carte, décalées
 *   en diagonale. On compte ses Plaines d'un regard ; on perd l'ordre de pose,
 *   et l'ordre de peinture ne suit plus les piles (voir `pileSlots`).
 * - `piles-fixed` — **piles de taille fixe.** Même dessin, mais remplies dans
 *   l'ordre reçu sans regarder le nom : l'ordre de pose est conservé, le
 *   comptage par type ne l'est pas.
 */
export type LandShape = 'rows' | 'grid' | 'piles-by-type' | 'piles-fixed';

export const LAND_SHAPES: readonly LandShape[] = ['rows', 'grid', 'piles-by-type', 'piles-fixed'];

export interface LandLayout {
  shape: LandShape;
  /**
   * Le nombre réglable — **et il ne veut pas dire la même chose selon la
   * forme** : rangées au plus pour `rows`, colonnes au plus pour `grid`,
   * cartes par pile pour `piles-fixed`, rien du tout pour `piles-by-type`, où
   * c'est le jeu du joueur qui décide de la taille des piles. D'où le nom
   * neutre : un champ appelé `rows` aurait menti dans trois cas sur quatre.
   * Bornes et défauts : `LAND_SIZE_RANGE`.
   */
  size: number;
  anchor: LandAnchor;
  /**
   * Part de la carte que la suivante recouvre, de 0 à `LAND_OVERLAP_MAX`.
   * Horizontalement pour `rows`, verticalement pour `grid`, et en diagonale
   * pour les piles (où il pilote un décalage d'autant plus petit qu'il est
   * grand — voir `pileStep`).
   */
  overlap: number;
}

export interface LandSizeRange {
  min: number;
  max: number;
  /** Ce qu'on prend quand rien de lisible n'a été enregistré pour cette forme. */
  fallback: number;
}

/**
 * Les bornes du nombre réglable, forme par forme.
 *
 * **Aucune n'est une contrainte de géométrie** : `landSlots` resserre de
 * lui-même ce qui ne tient pas, à n'importe quel nombre. Ce sont des choix de
 * lisibilité, et les mesures qui les motivent sont celles du panneau réel
 * (1076 × 660, utile 1060 × 644).
 *
 * - `rows` : quatre rangées ouvertes occupent 490 des 660 px du panneau. Une
 *   cinquième ne laisserait plus de place aux créatures, qui sont la raison
 *   d'être du champ de bataille.
 * - `grid` : moins de deux colonnes n'est plus une grille mais une pile
 *   maladroite. Huit n'est pas la limite du panneau — à huit colonnes le pas
 *   vaut encore les 85 px pleins et le bloc n'en occupe que 678 sur 1060 — mais
 *   le point au-delà duquel une base de mana normale (une quarantaine de
 *   terrains) tient en cinq rangées : le chevauchement vertical n'a plus grand
 *   chose à cacher, et l'on gagnerait mieux sa place en rangées.
 * - piles : une pile de moins de deux cartes est une carte. À dix, au décalage
 *   par défaut, une pile occupe déjà 218 × 250 px — un cinquième de la largeur
 *   utile, et quatre piles par ligne. Au-delà, on range des tours, plus des
 *   piles.
 *
 * `piles-by-type` porte quand même un intervalle : le champ existe dans l'objet
 * enregistré, et l'assainisseur doit en rendre *quelque chose*. Il n'est lu par
 * aucune géométrie.
 */
export const LAND_SIZE_RANGE: Readonly<Record<LandShape, LandSizeRange>> = {
  rows: { min: 1, max: 4, fallback: 2 },
  grid: { min: 2, max: 8, fallback: 6 },
  'piles-by-type': { min: 2, max: 10, fallback: 4 },
  'piles-fixed': { min: 2, max: 10, fallback: 4 },
};

/**
 * Au-delà de 60 %, il ne reste d'un terrain que sa tranche : ni le nom, ni le
 * symbole de mana ne s'y lisent, et l'on ne sait plus ce qu'on engage.
 */
export const LAND_OVERLAP_MAX = 0.6;

/**
 * Deux rangées par défaut, et non une.
 *
 * Une seule rangée est le réglage qui paraît le plus propre et celui qui sert
 * le plus mal : trente-sept terrains sur 1060 px de large forcent un pas de
 * 27 px, soit un tiers de carte visible, alors que la moitié basse du panneau
 * reste vide. Deux rangées ramènent le pas à une cinquantaine de pixels, ce
 * qui laisse le nom lisible. Comme `size` est un plafond pour cette forme, les
 * deux ou trois terrains du début de partie tiennent quand même sur une ligne.
 *
 * La forme par défaut reste `rows` : c'est la seule qui existait, et changer la
 * disposition sous les yeux de qui n'a rien demandé n'est pas un service.
 */
export const DEFAULT_LAND_LAYOUT: LandLayout = {
  shape: 'rows',
  size: 2,
  anchor: 'bottom-left',
  overlap: 0.25,
};

/**
 * Un terrain peint sur le champ de bataille : 83 × 115.
 *
 * Exporté pour que l'aperçu des réglages dessine ses rectangles à la taille que
 * cette géométrie suppose, plutôt qu'à une taille recopiée à côté qui finirait
 * par diverger sans que l'aperçu ait l'air faux.
 */
export const LAND_SLOT_W = Math.round(CARD_WIDTH * BATTLEFIELD_SCALE);
export const LAND_SLOT_H = Math.round(CARD_HEIGHT * BATTLEFIELD_SCALE);

/**
 * La sous-zone jouable d'un panneau de siège.
 *
 * C'est `PANEL_WIDTH` moins les deux colonnes latérales (commandement à
 * gauche, piles à droite) et `PANEL_HEIGHT` en entier — le repère dans lequel
 * les `x`/`y` d'une carte de champ de bataille sont exprimés. Les nombres sont
 * recopiés plutôt qu'importés de `components/SeatPanel.tsx`, pour la même
 * raison que dans `lib/drag.ts`, qui porte déjà les mêmes : un module de `lib/`
 * qui importerait un composant React entraînerait React dans chaque test qui
 * n'exerce que de l'arithmétique.
 */
export const BATTLEFIELD_BOUNDS = { width: 1076, height: 660 } as const;

/** Marge au bord du panneau : un terrain collé au bord se lit mal et s'attrape mal. */
const MARGIN = 8;

/** Respiration verticale entre deux rangées, comme la grille de `freeSpot`. */
const GAP_Y = 10;

/**
 * Écart entre deux colonnes de la grille.
 *
 * Deux pixels et non zéro : jointives au pixel près, les bordures de deux
 * colonnes voisines se touchent et la paire se lit comme une seule carte large.
 * Deux pixels suffisent à séparer, sans coûter une colonne.
 */
const GRID_GAP_X = 2;

/** Respiration entre deux piles voisines, dans les deux sens. */
const PILE_GAP = 10;

/**
 * Le plus grand décalage diagonal d'une pile, en pixels.
 *
 * Vingt est un réglage d'apparence et non une contrainte : assez pour qu'on
 * distingue et compte les cartes du dessous, assez peu pour qu'une pile de dix
 * tienne dans 218 × 250 px. `pileSlots` le réduit de lui-même dès que le
 * panneau ne suit plus — trente Plaines le ramènent à 6 px.
 */
const PILE_STEP_MAX = 20;

export interface LandSlot {
  x: number;
  y: number;
}

/** Ne fait jamais confiance à ce qui sort d'un stockage ou d'une API. */
export function sanitizeLandLayout(value: unknown): LandLayout {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

  const shapeRaw = raw['shape'];
  const shape = LAND_SHAPES.includes(shapeRaw as LandShape)
    ? (shapeRaw as LandShape)
    : DEFAULT_LAND_LAYOUT.shape;

  /*
   * `rows` est l'ancien nom de `size`, du temps où la seule forme possible
   * était faite de rangées. Il est encore lu ici, et le restera : une
   * préférence enregistrée sur un compte ne se remplace pas toute seule, et
   * celui qui avait réglé trois rangées il y a un mois n'a aucune raison d'en
   * retrouver deux sans avoir rien touché.
   */
  const sizeRaw = Number(raw['size'] ?? raw['rows']);
  /*
   * Les bornes sont celles de la forme **retenue**, et c'est un choix avec un
   * prix : régler huit colonnes puis passer aux rangées ramène le nombre à
   * quatre, et revenir aux colonnes en rend quatre, pas huit. Garder un nombre
   * par forme demanderait quatre champs à faire survivre au stockage et à
   * l'assainissement ; un seul nombre, borné à ce que la forme courante sait
   * faire, ne peut jamais produire de géométrie absurde.
   */
  const range = LAND_SIZE_RANGE[shape];
  const overlap = Number(raw['overlap']);
  const anchor = raw['anchor'];

  return {
    shape,
    size: Number.isFinite(sizeRaw)
      ? Math.min(range.max, Math.max(range.min, Math.round(sizeRaw)))
      : range.fallback,
    anchor: LAND_ANCHORS.includes(anchor as LandAnchor)
      ? (anchor as LandAnchor)
      : DEFAULT_LAND_LAYOUT.anchor,
    overlap: Number.isFinite(overlap)
      ? Math.min(LAND_OVERLAP_MAX, Math.max(0, overlap))
      : DEFAULT_LAND_LAYOUT.overlap,
  };
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), Math.max(0, max));
}

/**
 * Le dernier filet : aucune forme ne rend un emplacement sans passer par ici.
 *
 * Il ne sert presque jamais, et c'est mesuré : le retirer laisse passer toute
 * la batterie de `test/terrains-disposition.test.ts` **sauf** le cadre de
 * 40 × 40 px. Autrement dit, chaque forme se resserre déjà toute seule dans un
 * panneau de taille plausible, et ce bornage ne couvre que les cadres si petits
 * qu'une seule carte n'y entre pas — là où il n'y a plus de bonne réponse, et
 * où seule compte la garantie qu'aucune coordonnée ne devient négative.
 */
function place(x: number, y: number, bounds: { width: number; height: number }): LandSlot {
  return {
    x: Math.round(clamp(x, bounds.width - LAND_SLOT_W)),
    y: Math.round(clamp(y, bounds.height - LAND_SLOT_H)),
  };
}

/** Le sens de lecture qu'impose l'ancre. */
function reading(anchor: LandAnchor): { toLeft: boolean; upward: boolean } {
  return {
    toLeft: anchor === 'bottom-right' || anchor === 'top-right',
    upward: anchor === 'bottom-left' || anchor === 'bottom-right',
  };
}

/**
 * Les emplacements des terrains, dans l'ordre où on les leur donnera.
 *
 * L'appelant compte sur `slots[i]` pour `lands[i]` : **quelle que soit la
 * forme**, il y a exactement un emplacement par terrain et il est au même rang
 * que lui. Les piles groupent en interne, puis redistribuent.
 *
 * `key` est le nom de la carte. Seule `piles-by-type` le lit ; les trois autres
 * formes n'ont besoin que du nombre de terrains, et c'est voulu — l'appelant ne
 * doit pas avoir à savoir laquelle est réglée pour construire son entrée.
 *
 * **Le pas se resserre, le panneau ne cède jamais.** C'est la seule règle dure
 * de ce module, commune aux quatre formes : le chevauchement demandé est un
 * *souhait*, pas un contrat. Si la disposition voulue ne tient pas, elle se
 * resserre — plutôt que de laisser le dernier terrain sortir par le bord, où il
 * serait invisible sans que rien ne le signale.
 *
 * **L'ordre compte, et pas seulement pour la position.** Sur le champ de
 * bataille, tous les permanents non attachés partagent le même `zIndex` (30,
 * posé par `SeatPanel.tsx`) : ce qui décide du recouvrement est l'ordre de
 * peinture, c'est-à-dire l'ordre du tableau `battlefield`. L'appelant doit donc
 * donner ses terrains dans **cet ordre-là** et non dans un autre.
 */
export function landSlots(
  lands: ReadonlyArray<{ key: string }>,
  layout: LandLayout,
  bounds: { width: number; height: number } = BATTLEFIELD_BOUNDS,
): LandSlot[] {
  const safe = sanitizeLandLayout(layout);
  if (!Array.isArray(lands) || lands.length === 0) return [];
  const total = lands.length;

  switch (safe.shape) {
    case 'grid':
      return gridSlots(total, safe, bounds);
    case 'piles-by-type':
      return pileSlots(groupByKey(lands), total, safe, bounds);
    case 'piles-fixed':
      return pileSlots(groupByCount(total, safe.size), total, safe, bounds);
    case 'rows':
      return rowSlots(total, safe, bounds);
  }
}

/* ------------------------------------------------------------------------- *
 * `rows` — rangées à chevauchement horizontal.
 * ------------------------------------------------------------------------- */

/**
 * L'emplacement d'indice 0 est celui du coin d'ancrage ; les suivants
 * s'éloignent horizontalement, puis rangée par rangée vers le centre.
 */
function rowSlots(
  total: number,
  safe: LandLayout,
  bounds: { width: number; height: number },
): LandSlot[] {
  // `roomX` est la place qui reste une fois la *dernière* carte de la rangée
  // posée : c'est elle qui se partage entre les intervalles.
  const roomX = Math.max(0, bounds.width - 2 * MARGIN - LAND_SLOT_W);
  const wantedX = LAND_SLOT_W * (1 - safe.overlap);

  /*
   * `size` est un **plafond**, pas une consigne.
   *
   * Deux terrains sur quatre rangées demandées donneraient, à répartition
   * égale, une colonne d'un terrain par rangée : le réglage ferait exactement
   * l'inverse de ce pour quoi on l'a choisi. On n'ouvre donc une rangée de plus
   * que lorsque la précédente ne tient plus au chevauchement **voulu** — le
   * joueur règle « jusqu'à N rangées », et les premiers terrains du tour
   * s'alignent simplement sur une seule.
   *
   * Le prix : le nombre de rangées bouge en cours de partie, et le terrain
   * posé au bon moment fait sauter tout l'éventail d'une ligne. C'est un saut
   * visible, mais il n'arrive qu'au moment où l'on vient de cliquer sur
   * « Aligner » — jamais tout seul.
   */
  const perRowAtWantedStep = Math.max(1, Math.floor(roomX / wantedX) + 1);
  const rows = Math.max(1, Math.min(safe.size, Math.ceil(total / perRowAtWantedStep)));

  const perRow = Math.floor(total / rows);
  // Le reste va aux premières rangées, c'est-à-dire aux plus proches du coin
  // d'ancrage : on remplit depuis l'ancre, on ne la fuit pas.
  const remainder = total % rows;
  const widest = perRow + (remainder > 0 ? 1 : 0);

  const stepX = widest > 1 ? Math.min(wantedX, roomX / (widest - 1)) : wantedX;

  const roomY = Math.max(0, bounds.height - 2 * MARGIN - LAND_SLOT_H);
  const wantedY = LAND_SLOT_H + GAP_Y;
  const stepY = rows > 1 ? Math.min(wantedY, roomY / (rows - 1)) : wantedY;

  const { toLeft, upward } = reading(safe.anchor);

  const slots: LandSlot[] = [];
  for (let row = 0; row < rows; row++) {
    const inRow = perRow + (row < remainder ? 1 : 0);
    const y = upward ? bounds.height - MARGIN - LAND_SLOT_H - row * stepY : MARGIN + row * stepY;

    for (let rank = 0; rank < inRow; rank++) {
      const x = toLeft ? bounds.width - MARGIN - LAND_SLOT_W - rank * stepX : MARGIN + rank * stepX;
      slots.push(place(x, y, bounds));
    }
  }
  return slots;
}

/* ------------------------------------------------------------------------- *
 * `grid` — colonnes jointives, éventail vertical.
 * ------------------------------------------------------------------------- */

/**
 * Colonnes côte à côte, et c'est la **verticale** qui chevauche.
 *
 * Le remplissage est ligne par ligne et non colonne par colonne : avec trois
 * terrains et six colonnes réglées, le remplissage par colonne les empilerait
 * l'un sur l'autre en laissant le panneau vide à droite, alors qu'ils tiennent
 * côte à côte sans se toucher.
 *
 * **L'éventail descend toujours, même ancré en bas**, et c'est la seule forme
 * où l'ancre ne commande pas le sens. La raison tient au recouvrement : le
 * terrain peint après recouvre celui d'avant, donc pour qu'il n'en cache que le
 * *bas* — laissant le nom et le début de l'illustration — il doit être placé
 * plus bas que lui. Un éventail montant montrerait le bas des cartes,
 * c'est-à-dire du texte de rappel et rien d'identifiable. L'ancre déplace donc
 * le bloc entier vers le bord choisi, et l'intérieur se lit toujours de haut en
 * bas. Le prix est un réglage qui obéit à moitié ; ce qu'on achète est la seule
 * chose que cette forme ait à offrir.
 */
function gridSlots(
  total: number,
  safe: LandLayout,
  bounds: { width: number; height: number },
): LandSlot[] {
  // Plafond, comme les rangées : six colonnes réglées et trois terrains font
  // trois colonnes, pas six colonnes dont trois vides.
  const cols = Math.max(1, Math.min(safe.size, total));
  const rows = Math.ceil(total / cols);

  const roomX = Math.max(0, bounds.width - 2 * MARGIN - LAND_SLOT_W);
  const wantedX = LAND_SLOT_W + GRID_GAP_X;
  const stepX = cols > 1 ? Math.min(wantedX, roomX / (cols - 1)) : wantedX;

  const roomY = Math.max(0, bounds.height - 2 * MARGIN - LAND_SLOT_H);
  const wantedY = LAND_SLOT_H * (1 - safe.overlap);
  const stepY = rows > 1 ? Math.min(wantedY, roomY / (rows - 1)) : wantedY;

  const { toLeft, upward } = reading(safe.anchor);
  const blockH = (rows - 1) * stepY + LAND_SLOT_H;
  const top = upward ? bounds.height - MARGIN - blockH : MARGIN;

  const slots: LandSlot[] = [];
  for (let rank = 0; rank < total; rank++) {
    const col = rank % cols;
    const row = Math.floor(rank / cols);
    const x = toLeft ? bounds.width - MARGIN - LAND_SLOT_W - col * stepX : MARGIN + col * stepX;
    slots.push(place(x, top + row * stepY, bounds));
  }
  return slots;
}

/* ------------------------------------------------------------------------- *
 * `piles-by-type` et `piles-fixed` — piles en diagonale.
 * ------------------------------------------------------------------------- */

/**
 * Une pile par nom, dans l'ordre de **première apparition**.
 *
 * Pas dans l'ordre alphabétique : l'ordre d'apparition est celui de la pose,
 * donc celui que le joueur a sous les yeux depuis le début de la partie, et il
 * ne change pas quand on ajoute une Plaine à une pile existante. Un tri par nom
 * ferait glisser toutes les piles d'un cran le jour où l'on pose son premier
 * Bosquet.
 *
 * Rend, pour chaque pile, les **indices d'entrée** de ses cartes — c'est ce qui
 * permet de redistribuer les positions dans l'ordre reçu.
 */
function groupByKey(lands: ReadonlyArray<{ key: string }>): number[][] {
  const byKey = new Map<string, number[]>();
  lands.forEach((land, index) => {
    // Une fiche pas encore en cache n'a pas de nom : toutes ces cartes-là
    // finissent dans la même pile plutôt que de faire tomber le groupement.
    const key = typeof land?.key === 'string' ? land.key : '';
    const pile = byKey.get(key);
    if (pile) pile.push(index);
    else byKey.set(key, [index]);
  });
  return [...byKey.values()];
}

/** Des piles de `perPile` cartes, remplies dans l'ordre reçu, sans rien lire. */
function groupByCount(total: number, perPile: number): number[][] {
  const size = Math.max(1, Math.floor(perPile));
  const piles: number[][] = [];
  for (let index = 0; index < total; index++) {
    if (index % size === 0) piles.push([]);
    piles[piles.length - 1]!.push(index);
  }
  return piles;
}

/**
 * Le décalage diagonal voulu, d'après le chevauchement.
 *
 * Il **décroît** quand le chevauchement croît, contrairement aux pas des deux
 * autres formes qui, eux, sont des distances entre cartes : ici le réglage dit
 * « recouvre davantage », et recouvrir davantage veut dire décaler moins.
 */
function pileStep(overlap: number): number {
  return Math.round(PILE_STEP_MAX * (1 - overlap));
}

/**
 * Des piles alignées, qui passent à la ligne, et se resserrent plutôt que de
 * sortir du cadre.
 *
 * **Toutes les piles ont la même empreinte**, celle de la plus profonde. Avec
 * trente Plaines et cinq terrains uniques, la diagonale tombe de 15 à 6 px pour
 * *tout le monde*, y compris pour les piles d'une seule carte qui auraient tenu
 * sans peine. L'alternative — une largeur de colonne par pile — rendrait
 * l'alignement irrégulier et le calcul du passage à la ligne bien plus fragile,
 * pour un gain qui ne se voit que dans les mains très déséquilibrées.
 *
 * Le resserrement se fait en deux temps, et dans cet ordre : d'abord la
 * diagonale (on cherche le plus grand décalage qui tienne, en descendant de
 * pixel en pixel — vingt et un essais au pire), ensuite seulement le pas entre
 * piles. C'est l'ordre qui abîme le moins : une diagonale plus courte cache le
 * nom des cartes du dessous, mais des piles qui se chevauchent cachent des
 * cartes entières.
 *
 * **Ce que le groupement coûte au recouvrement, honnêtement.** Les cartes d'une
 * même pile gardent entre elles leur ordre d'entrée, donc leur ordre de
 * peinture : à l'intérieur d'une pile, chaque carte recouvre bien la précédente
 * et le coin haut-gauche de celle du dessous reste visible. Mais d'une pile à
 * l'autre, l'ordre de peinture reste celui de la pose et ne suit pas les piles :
 * la troisième Plaine peut être peinte après la première Île. Tant que les piles
 * ne se touchent pas — le cas normal —, cela ne se voit pas. Dès qu'elles se
 * chevauchent, c'est-à-dire quand le panneau a forcé le resserrement du pas
 * entre piles, le recouvrement entre voisines devient irrégulier : une pile
 * passe devant sa voisine de droite sur une carte et derrière sur la suivante.
 * `landSlots` ne peut rien y faire, puisque la peinture ne lui appartient pas.
 */
function pileSlots(
  piles: number[][],
  total: number,
  safe: LandLayout,
  bounds: { width: number; height: number },
): LandSlot[] {
  const depth = piles.reduce((deepest, pile) => Math.max(deepest, pile.length), 1);
  const availW = Math.max(0, bounds.width - 2 * MARGIN);
  const availH = Math.max(0, bounds.height - 2 * MARGIN);

  let step = 0;
  let perLine = 1;
  let lines = piles.length;
  for (let candidate = pileStep(safe.overlap); candidate >= 0; candidate--) {
    const pileW = LAND_SLOT_W + (depth - 1) * candidate;
    const pileH = LAND_SLOT_H + (depth - 1) * candidate;
    const fitting = Math.max(1, Math.floor((availW + PILE_GAP) / (pileW + PILE_GAP)));
    const needed = Math.ceil(piles.length / fitting);

    step = candidate;
    perLine = fitting;
    lines = needed;
    if (pileW <= availW && needed * pileH + (needed - 1) * PILE_GAP <= availH) break;
  }

  const pileW = LAND_SLOT_W + (depth - 1) * step;
  const pileH = LAND_SLOT_H + (depth - 1) * step;
  const pitchX =
    perLine > 1
      ? Math.min(pileW + PILE_GAP, Math.max(0, availW - pileW) / (perLine - 1))
      : pileW + PILE_GAP;
  const pitchY =
    lines > 1
      ? Math.min(pileH + PILE_GAP, Math.max(0, availH - pileH) / (lines - 1))
      : pileH + PILE_GAP;

  const { toLeft, upward } = reading(safe.anchor);
  // Même raison que pour la grille : la diagonale descend toujours, donc c'est
  // le bloc qu'on accroche au bord choisi, pas chaque ligne.
  const blockH = (lines - 1) * pitchY + pileH;
  const top = upward ? bounds.height - MARGIN - blockH : MARGIN;

  const slots: LandSlot[] = new Array<LandSlot>(total);
  piles.forEach((pile, rank) => {
    const line = Math.floor(rank / perLine);
    const column = rank % perLine;
    const left = toLeft ? bounds.width - MARGIN - pileW - column * pitchX : MARGIN + column * pitchX;
    const lineTop = top + line * pitchY;

    // La redistribution : `index` est le rang d'entrée du terrain, `depthRank`
    // sa profondeur dans la pile. C'est ce qui rend `slots[i]` à `lands[i]`.
    pile.forEach((index, depthRank) => {
      slots[index] = place(left + depthRank * step, lineTop + depthRank * step, bounds);
    });
  });
  return slots;
}

/**
 * Cette ligne de type est-elle celle d'un terrain ?
 *
 * `CardMeta.typeLine` est **toujours en anglais** — c'est ce que Scryfall
 * publie, et le projet l'assume —, d'où le mot-clé anglais dans une base de
 * code française.
 *
 * Deux gardes, et elles ne servent pas au même moment.
 *
 * Les **sous-types** vivent après le tiret cadratin et ne disent rien du type :
 * on ne regarde que ce qui le précède. C'est ce qui empêche
 * « Creature — Island Fish » d'être un terrain — « Island » porte bien les
 * quatre lettres de `land`.
 *
 * La **frontière de mot** prend le relais quand le découpage ne peut rien : une
 * ligne dont le séparateur n'est pas le tiret cadratin — un tiret simple, une
 * ligne recomposée à la main — traverse le `split` intacte, et le mot entier
 * est alors la seule chose qui distingue « Land » d'« Island ».
 *
 * Les deux faces sont examinées : une face avant Terrain suffit.
 */
export function isLandTypeLine(typeLine: string | null | undefined): boolean {
  if (typeof typeLine !== 'string') return false;
  return typeLine
    .split('//')
    .some((face) => /\bland\b/.test((face.split('—')[0] ?? '').toLowerCase()));
}

/* ------------------------------------------------------------------------- *
 * Persistance.
 * ------------------------------------------------------------------------- */

/** Clé dans `UserPrefs.extra`, pour un compte. */
const EXTRA_KEY = 'landLayout';
/** Clé dans `localStorage`, pour un invité — et repli quand le PATCH échoue. */
const STORAGE_KEY = 'mtg.landLayout';

/**
 * Tout est enveloppé : en navigation privée, `localStorage` **lève** au lieu de
 * rendre `null`, et un réglage de rangement ne doit pas faire tomber la table.
 */
function readLocal(): LandLayout {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return sanitizeLandLayout(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_LAND_LAYOUT };
  }
}

function writeLocal(layout: LandLayout): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Stockage refusé : le réglage vaut pour la session, et c'est tout.
  }
}

/**
 * Le réglage du joueur. Un compte l'emporte ; s'il n'en porte pas encore — ou
 * si l'on joue en invité —, on reprend ce qui traînait localement, ce qui
 * évite de perdre son réglage en se créant un compte.
 */
export async function loadLandLayout(): Promise<LandLayout> {
  const stored = await readAccountExtra(EXTRA_KEY);
  if (stored !== undefined) return sanitizeLandLayout(stored);
  return readLocal();
}

/** Enregistre le réglage, là où ce joueur-là le garde. Ne lève jamais. */
export async function saveLandLayout(layout: LandLayout): Promise<void> {
  const safe = sanitizeLandLayout(layout);
  writeLocal(safe);
  await writeAccountExtra(EXTRA_KEY, safe);
}
