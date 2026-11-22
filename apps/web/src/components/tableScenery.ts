/**
 * Géométrie du paysage de fond, dessinée de zéro.
 *
 * Tout ce qui suit est **original** et purement procédural : aucun tracé n'est
 * repris d'une œuvre existante, aucun lieu n'est nommé, aucune marque n'est
 * citée. Les formes sortent d'un bruit déterministe, donc le décor est le même
 * chez tous les joueurs sans qu'on ait à le transporter sur le réseau.
 *
 * Le module ne produit que des **données** — des chaînes `d` de chemins et des
 * points. Il ne connaît ni React, ni couleur, ni opacité : c'est
 * `TableBackground` qui peint. On peut donc éprouver la géométrie dans un test
 * sans monter de DOM.
 *
 * Le repère est celui du décor lui-même (origine au coin haut-gauche du
 * débord), et toute la composition est ancrée sur le centre de la grille des
 * sièges — jamais sur le siège local. C'est l'invariant du monde partagé : le
 * ciel est en haut du monde, le sol en bas, pour tout le monde.
 */

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Table de valeurs pour un bruit 1D, bouclée : `sample` peut sortir du cadre. */
function table(seed: number, count = 257): number[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: count }, () => rnd() * 2 - 1);
}

/** Interpolation cosinus : des crêtes rondes plutôt que des angles de scie. */
function sample(values: number[], t: number): number {
  const n = values.length;
  const i = Math.floor(t);
  const f = t - i;
  const a = values[((i % n) + n) % n] ?? 0;
  const b = values[(((i + 1) % n) + n) % n] ?? 0;
  const s = (1 - Math.cos(f * Math.PI)) / 2;
  return a * (1 - s) + b * s;
}

export interface ProfileOptions {
  seed: number;
  /** Amplitude de la première octave, en unités de monde. */
  amp: number;
  /** Longueur d'onde de la première octave, en unités de monde. */
  wavelength: number;
  octaves: number;
  /** Décroissance d'amplitude d'une octave à la suivante. */
  gain?: number;
  /**
   * `true` : bruit « ridged », qui plie le bruit autour de zéro et fabrique des
   * arêtes nettes — des montagnes. `false` : bruit doux, pour une ligne de
   * terrasse ou un rivage.
   */
  ridged?: boolean;
}

/**
 * Hauteur du relief au-dessus de sa ligne de base, en fonction de `x`.
 *
 * Toujours positive : un relief ne creuse pas sous sa base, il monte. Les
 * appelants qui veulent une ligne qui ondule des deux côtés passent
 * `ridged: false` et retranchent la moitié de l'amplitude.
 */
export function profile(options: ProfileOptions): (x: number) => number {
  const { seed, amp, wavelength, octaves, gain = 0.5, ridged = true } = options;
  const tables = Array.from({ length: octaves }, (_, o) => table(seed + o * 101));
  return (x: number): number => {
    let sum = 0;
    let a = amp;
    let wl = wavelength;
    for (let o = 0; o < octaves; o++) {
      const n = sample(tables[o] ?? [], x / wl);
      sum += ridged ? a * (1 - Math.abs(n)) : a * n;
      wl /= 2.17;
      a *= gain;
    }
    return sum;
  };
}

export interface RidgeOptions extends ProfileOptions {
  x0: number;
  x1: number;
  /** Ligne de base : le pied du relief. */
  baseY: number;
  /** Jusqu'où la silhouette est remplie vers le bas. */
  bottomY: number;
  /** Pas d'échantillonnage, en unités de monde. */
  step: number;
}

/**
 * Silhouette pleine d'une chaîne de reliefs.
 *
 * Le remplissage descend jusqu'à `bottomY` : chaque plan recouvre donc le bas
 * du plan précédent, et c'est cette superposition — du plus clair au fond au
 * plus sombre devant — qui fabrique la profondeur atmosphérique.
 */
export function ridge(options: RidgeOptions): { d: string; at: (x: number) => number } {
  const { x0, x1, baseY, bottomY, step } = options;
  const f = profile(options);
  const at = (x: number): number => baseY - f(x);

  const points: string[] = [];
  for (let x = x0; x <= x1; x += step) points.push(`${round(x)} ${round(at(x))}`);
  points.push(`${round(x1)} ${round(at(x1))}`);

  return {
    d: `M ${round(x0)} ${round(bottomY)} L ${points.join(' L ')} L ${round(x1)} ${round(bottomY)} Z`,
    at,
  };
}

/**
 * Ligne de terrasse : une arête douce qui traverse le bassin, remplie vers le
 * bas. C'est ce qui donne du relief au sol sur lequel se posent les cartes,
 * sans jamais faire de silhouette assez contrastée pour concurrencer un
 * permanent.
 */
export function terrace(options: RidgeOptions): { d: string; edge: string; at: (x: number) => number } {
  const { x0, x1, baseY, bottomY, step } = options;
  const f = profile({ ...options, ridged: false });
  const at = (x: number): number => baseY - f(x);

  const points: string[] = [];
  for (let x = x0; x <= x1; x += step) points.push(`${round(x)} ${round(at(x))}`);

  return {
    d: `M ${round(x0)} ${round(bottomY)} L ${points.join(' L ')} L ${round(x1)} ${round(bottomY)} Z`,
    edge: `M ${points.join(' L ')}`,
    at,
  };
}

export interface RiverOptions {
  seed: number;
  /** Extrémité lointaine (en haut) et extrémité proche (en bas). */
  yFar: number;
  yNear: number;
  xFar: number;
  /** Déport horizontal total entre le lointain et le proche. */
  drift: number;
  /** Demi-largeur au loin, puis au près : la perspective fait le reste. */
  halfFar: number;
  halfNear: number;
  /** Amplitude et longueur d'onde du méandre, en unités de monde. */
  meander: number;
  meanderLength?: number;
  step: number;
}

/**
 * Cours d'eau : un ruban qui descend du lointain vers le premier plan en
 * s'élargissant. Il capte la lumière du ciel, donc il est plus clair que le
 * sol — c'est le seul trait vraiment lumineux du bassin, et il passe
 * volontairement à côté de la grille des sièges, pas dessous.
 */
export function river(options: RiverOptions): string {
  const { seed, yFar, yNear, xFar, drift, halfFar, halfNear, meander, step } = options;
  const wander = profile({
    seed,
    amp: meander,
    wavelength: options.meanderLength ?? 2600,
    octaves: 3,
    ridged: false,
  });
  const span = Math.max(1, yNear - yFar);

  const centre = (y: number): number => {
    const t = (y - yFar) / span;
    return xFar + drift * t * t + wander(y) * (0.35 + t);
  };
  const half = (y: number): number => {
    const t = (y - yFar) / span;
    return halfFar + (halfNear - halfFar) * t * t;
  };

  const left: string[] = [];
  const right: string[] = [];
  for (let y = yFar; y <= yNear; y += step) {
    left.push(`${round(centre(y) - half(y))} ${round(y)}`);
    right.unshift(`${round(centre(y) + half(y))} ${round(y)}`);
  }
  return `M ${left.join(' L ')} L ${right.join(' L ')} Z`;
}

/** Une tour élancée, posée sur une crête : deux murs, un toit, rien de plus. */
export function tower(x: number, y: number, height: number): string {
  const w = height * 0.16;
  const top = y - height;
  const spire = top - height * 0.3;
  return (
    `M ${round(x - w)} ${round(y)} L ${round(x - w * 0.72)} ${round(top)} ` +
    `L ${round(x)} ${round(spire)} L ${round(x + w * 0.72)} ${round(top)} ` +
    `L ${round(x + w)} ${round(y)} Z`
  );
}

/**
 * Pont en arche entre deux crêtes. Le tablier est une bande droite, l'arche un
 * simple arc : à la distance où il est posé, il ne fait que quelques pixels et
 * toute finesse supplémentaire serait perdue.
 */
export function bridge(x0: number, x1: number, y: number): string {
  const rise = (x1 - x0) * 0.26;
  const deck = y - (x1 - x0) * 0.07;
  return (
    `M ${round(x0)} ${round(y)} L ${round(x0)} ${round(deck)} L ${round(x1)} ${round(deck)} ` +
    `L ${round(x1)} ${round(y)} L ${round(x1 - (x1 - x0) * 0.12)} ${round(y)} ` +
    `A ${round((x1 - x0) * 0.38)} ${round(rise)} 0 0 0 ${round(x0 + (x1 - x0) * 0.12)} ${round(y)} Z`
  );
}

/** Îlot suspendu : un dessus plat, un dessous en pointe. */
export function island(x: number, y: number, width: number): string {
  const w = width / 2;
  return (
    `M ${round(x - w)} ${round(y)} L ${round(x + w)} ${round(y)} ` +
    `L ${round(x + w * 0.55)} ${round(y + width * 0.22)} ` +
    `L ${round(x + w * 0.1)} ${round(y + width * 0.62)} ` +
    `L ${round(x - w * 0.3)} ${round(y + width * 0.3)} ` +
    `L ${round(x - w * 0.8)} ${round(y + width * 0.15)} Z`
  );
}

/** Un oiseau : deux traits. À cette taille, c'est tout ce qui se lit. */
export function bird(x: number, y: number, size: number): string {
  return (
    `M ${round(x - size)} ${round(y)} Q ${round(x - size * 0.45)} ${round(y - size * 0.62)} ${round(x)} ${round(y)} ` +
    `Q ${round(x + size * 0.45)} ${round(y - size * 0.62)} ${round(x + size)} ${round(y)}`
  );
}

/**
 * Semis de petites silhouettes (rochers, arbres) le long d'une arête.
 *
 * Elles sont rares et irrégulières : une haie régulière trahirait le procédé.
 * Le semis saute la bande centrale, qui est celle des cartes.
 */
export function scatter(options: {
  seed: number;
  x0: number;
  x1: number;
  at: (x: number) => number;
  size: number;
  count: number;
  /** Demi-largeur de la bande centrale laissée vide, autour de `centreX`. */
  centreX: number;
  clearHalf: number;
}): string {
  const { seed, x0, x1, at, size, count, centreX, clearHalf } = options;
  const rnd = mulberry32(seed);
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = x0 + (x1 - x0) * rnd();
    if (Math.abs(x - centreX) < clearHalf) continue;
    const s = size * (0.55 + rnd() * 0.9);
    const y = at(x);
    // Un conifère : un cône aux flancs **concaves**, légèrement penché. Le
    // triangle droit qu'on écrit d'abord se lit comme une forme géométrique dès
    // qu'on s'approche ; deux quadratiques coûtent le même prix et donnent une
    // silhouette d'arbre à toutes les échelles.
    const lean = (rnd() - 0.5) * s * 0.28;
    const top = y - s * (1.3 + rnd() * 0.5);
    parts.push(
      `M ${round(x - s * 0.44)} ${round(y + s * 0.1)} ` +
        `Q ${round(x + lean - s * 0.2)} ${round((y + top) / 2)} ${round(x + lean)} ${round(top)} ` +
        `Q ${round(x + lean + s * 0.2)} ${round((y + top) / 2)} ${round(x + s * 0.44)} ${round(y + s * 0.1)} Z`,
    );
  }
  return parts.join(' ');
}

/** Monolithes dressés : trois dalles inégales, légèrement penchées. */
export function monoliths(x: number, y: number, height: number): string {
  const slab = (dx: number, k: number, lean: number): string => {
    const hh = height * k;
    const w = hh * 0.17;
    return (
      `M ${round(x + dx - w)} ${round(y)} L ${round(x + dx - w + lean)} ${round(y - hh)} ` +
      `L ${round(x + dx + w + lean)} ${round(y - hh * 0.93)} L ${round(x + dx + w)} ${round(y)} Z`
    );
  };
  return [
    slab(-height * 0.42, 0.74, -height * 0.05),
    slab(0, 1, height * 0.02),
    slab(height * 0.38, 0.6, height * 0.06),
  ].join(' ');
}

function round(v: number): number {
  return Math.round(v * 10) / 10;
}
