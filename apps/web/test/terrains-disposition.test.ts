/**
 * La géométrie de la disposition des terrains.
 *
 * Ce qu'on protège ici n'est pas l'esthétique de l'éventail mais une panne
 * muette : une carte posée hors du panneau n'échoue nulle part — le serveur
 * l'accepte, le client la dessine — elle devient simplement invisible. Aucune
 * exception, aucun journal, juste un terrain que le joueur cherche. Le cas
 * « 40 terrains sur 2 rangées » est celui qui a motivé le resserrement du pas :
 * sans chevauchement, vingt terrains bord à bord occupent 1660 px dans un
 * panneau qui en fait 1076, et les derniers sortaient simplement du cadre.
 *
 * Depuis qu'il y a **quatre formes**, la même panne a quatre façons d'arriver,
 * et chacune resserre autrement : le pas horizontal pour les rangées, le pas
 * vertical pour la grille, la diagonale puis l'écart entre piles pour les deux
 * formes en piles. Le balayage d'invariante les traverse donc toutes les
 * quatre plutôt que la seule qui existait.
 *
 * S'y ajoute une invariante que l'ancienne signature ne pouvait pas trahir :
 * `slots[i]` appartient à `lands[i]`. `piles-by-type` groupe par nom, donc
 * calcule dans un ordre qui n'est pas celui de l'entrée ; si la redistribution
 * se décalait d'un cran, chaque terrain irait à la place de son voisin sans
 * qu'aucune borne ne soit franchie.
 *
 * Le vérificateur a sa part : ce qui sort de `UserPrefs.extra` ou de
 * `localStorage` a pu être écrit par une autre version du client, ou à la main
 * — ou par la version d'avant, qui appelait `size` un `rows` et réglait d'un
 * seul `overlap` ce qui se règle aujourd'hui en deux. Cette migration-là est
 * testée au pixel, contre un relevé pris sur le code d'avant : `AVANT`.
 */
import { describe, expect, it } from 'vitest';
import {
  BATTLEFIELD_BOUNDS,
  DEFAULT_LAND_LAYOUT,
  LAND_ANCHORS,
  LAND_DIAGONAL_RANGE,
  LAND_SHAPES,
  LAND_SIZE_RANGE,
  LAND_SPACING_RANGE,
  isLandTypeLine,
  landSlots,
  sanitizeLandLayout,
  type LandAnchor,
  type LandLayout,
  type LandShape,
} from '../src/lib/landLayout.js';

/** Les mêmes que celles peintes sur le champ de bataille : 166×230 à l'échelle 0,5. */
const LAND_W = 83;
const LAND_H = 115;

const layout = (over: Partial<LandLayout> = {}): LandLayout => ({ ...DEFAULT_LAND_LAYOUT, ...over });

/** `count` terrains anonymes : de quoi exercer les trois formes qui ne lisent pas les noms. */
const anonymes = (count: number): Array<{ key: string }> =>
  Array.from({ length: count }, (_, rank) => ({ key: `terrain-${rank}` }));

/** `count` terrains dont les noms tournent sur `names` — donc **mêlés**, comme en partie. */
const meles = (count: number, names: readonly string[]): Array<{ key: string }> =>
  Array.from({ length: count }, (_, rank) => ({ key: names[rank % names.length]! }));

describe('landSlots — le cadre, pour les quatre formes', () => {
  it('ne rend rien pour une liste vide ou absurde', () => {
    for (const shape of LAND_SHAPES) {
      expect(landSlots([], layout({ shape }))).toEqual([]);
      expect(landSlots(undefined as never, layout({ shape }))).toEqual([]);
      expect(landSlots(42 as never, layout({ shape }))).toEqual([]);
    }
  });

  it('rend exactement un emplacement par terrain, sans trou', () => {
    for (const shape of LAND_SHAPES) {
      for (const count of [1, 2, 7, 37, 40, 96]) {
        const slots = landSlots(meles(count, ['Plains', 'Island', 'Forest']), layout({ shape }));
        expect(slots.length).toBe(count);
        // `piles-by-type` remplit un tableau par indices : un trou passerait
        // `length` sans être vu, et laisserait un terrain là où il était.
        for (let rank = 0; rank < count; rank++) expect(slots[rank]).toBeDefined();
      }
    }
  });

  it('ne laisse jamais un terrain sortir du panneau', () => {
    // Le balayage est large exprès : c'est l'invariante du module, pas un cas.
    // Les tailles couvrent l'union des intervalles ; `sanitizeLandLayout` borne
    // chacune à ce que sa forme accepte.
    for (const shape of LAND_SHAPES) {
      for (const count of [1, 2, 3, 12, 40, 120]) {
        const lands = meles(count, ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']);
        for (const size of [1, 2, 4, 8, 10]) {
          // L'espacement est balayé des deux côtés du zéro : le côté positif
          // est le seul réglage qui puisse, à lui seul, demander plus de place
          // que le panneau n'en a, et c'est donc lui le nouveau suspect.
          for (const spacing of [-0.6, -0.25, 0, 0.3]) {
            for (const diagonal of [0, 25]) {
              for (const anchor of LAND_ANCHORS) {
                for (const slot of landSlots(lands, { shape, size, anchor, spacing, diagonal })) {
                  expect(slot.x).toBeGreaterThanOrEqual(0);
                  expect(slot.y).toBeGreaterThanOrEqual(0);
                  expect(slot.x + LAND_W).toBeLessThanOrEqual(BATTLEFIELD_BOUNDS.width);
                  expect(slot.y + LAND_H).toBeLessThanOrEqual(BATTLEFIELD_BOUNDS.height);
                }
              }
            }
          }
        }
      }
    }
  });

  it('ne déborde pas non plus quand chaque terrain porte un nom différent', () => {
    // Le cas propre à `piles-by-type` : cent vingt noms distincts, donc cent
    // vingt piles à caser, là où une main normale en fait cinq.
    for (const anchor of LAND_ANCHORS) {
      for (const slot of landSlots(anonymes(120), layout({ shape: 'piles-by-type', anchor }))) {
        expect(slot.x + LAND_W).toBeLessThanOrEqual(BATTLEFIELD_BOUNDS.width);
        expect(slot.y + LAND_H).toBeLessThanOrEqual(BATTLEFIELD_BOUNDS.height);
      }
    }
  });

  it('resserre aussi dans un panneau bas, quelle que soit la forme', () => {
    const bas = { width: 1076, height: 200 };
    for (const shape of LAND_SHAPES) {
      for (const slot of landSlots(meles(60, ['Plains', 'Island']), layout({ shape, size: 4 }), bas)) {
        expect(slot.y).toBeGreaterThanOrEqual(0);
        expect(slot.y + LAND_H).toBeLessThanOrEqual(bas.height);
      }
    }
  });

  it('tient même dans un cadre plus petit qu’une carte', () => {
    // Personne ne joue là-dedans ; c'est la garde qui empêche une largeur
    // négative de produire un `x` négatif, donc une carte hors cadre.
    for (const shape of LAND_SHAPES) {
      for (const slot of landSlots(anonymes(6), layout({ shape }), { width: 40, height: 40 })) {
        expect(slot.x).toBe(0);
        expect(slot.y).toBe(0);
      }
    }
  });
});

describe('landSlots — rangées', () => {
  it('resserre le pas plutôt que de déborder : 40 terrains sur 2 rangées', () => {
    const slots = landSlots(anonymes(40), layout({ size: 2, spacing: 0 }));
    // Vingt cartes de 83 px bord à bord font 1660 px : le panneau en fait 1076.
    const xs = slots.map((s) => s.x);
    expect(Math.max(...xs) + LAND_W).toBeLessThanOrEqual(BATTLEFIELD_BOUNDS.width);
    // Et le pas obtenu est bien plus serré que celui demandé.
    expect(xs[1]! - xs[0]!).toBeLessThan(LAND_W);
  });

  it('n’ouvre une rangée de plus que lorsque la précédente déborde', () => {
    // Deux terrains et quatre rangées autorisées : une seule rangée, sinon la
    // paire serait séparée par 250 px de vide — le réglage ferait l'inverse de
    // ce pour quoi on l'a choisi.
    expect(new Set(landSlots(anonymes(2), layout({ size: 4 })).map((s) => s.y)).size).toBe(1);
    // Assez de terrains pour déborder au pas voulu : la seconde s'ouvre.
    expect(new Set(landSlots(anonymes(40), layout({ size: 4 })).map((s) => s.y)).size).toBe(3);
  });

  it('répartit les terrains sur le nombre de rangées demandé', () => {
    const slots = landSlots(anonymes(37), layout({ size: 3 }));
    const parLigne = new Map<number, number>();
    for (const slot of slots) parLigne.set(slot.y, (parLigne.get(slot.y) ?? 0) + 1);
    expect([...parLigne.values()].sort((a, b) => b - a)).toEqual([13, 12, 12]);
  });

  it('part du coin demandé, et s’en éloigne', () => {
    const [premier, second] = landSlots(anonymes(6), layout({ size: 1, anchor: 'bottom-left' }));
    expect(premier!.x).toBeLessThan(second!.x);
    expect(premier!.y + LAND_H).toBeGreaterThan(BATTLEFIELD_BOUNDS.height - 20);

    const [droite, apres] = landSlots(anonymes(6), layout({ size: 1, anchor: 'top-right' }));
    expect(droite!.x).toBeGreaterThan(apres!.x);
    expect(droite!.y).toBeLessThan(20);
  });

  it('empile les rangées vers le centre, jamais vers le bord d’ancrage', () => {
    const bas = landSlots(anonymes(24), layout({ size: 2, anchor: 'bottom-left' }));
    const haut = landSlots(anonymes(24), layout({ size: 2, anchor: 'top-left' }));
    // Ancré en bas, la seconde rangée est *au-dessus* de la première.
    expect(bas[23]!.y).toBeLessThan(bas[0]!.y);
    expect(haut[23]!.y).toBeGreaterThan(haut[0]!.y);
  });

  it('l’espacement se lit dans le pas, des deux côtés du zéro', () => {
    const pas = (spacing: number): number => {
      const slots = landSlots(anonymes(4), layout({ size: 1, spacing }));
      return slots[1]!.x - slots[0]!.x;
    };
    // Négatif : les cartes se recouvrent — tout ce que savait dire le réglage
    // unique d'avant.
    expect(pas(-0.5)).toBe(Math.round(LAND_W * 0.5));
    // Zéro : jointives, bord à bord.
    expect(pas(0)).toBe(LAND_W);
    // Positif : de l'air entre elles, ce qui était impossible.
    expect(pas(0.3)).toBe(Math.round(LAND_W * 1.3));
  });

  it('une base de mana de Commander tient encore à l’espacement maximal', () => {
    // C'est ce cas-là, et pas un jugement d'apparence, qui fixe la borne haute
    // de `LAND_SPACING_RANGE` : trente-sept terrains sur les quatre rangées du
    // maximum, au pas voulu, sans que le resserrement ait à s'en mêler.
    const slots = landSlots(anonymes(37), layout({ size: 4, spacing: LAND_SPACING_RANGE.max }));
    expect(new Set(slots.map((s) => s.y)).size).toBe(4);
    expect(slots[1]!.x - slots[0]!.x).toBe(Math.round(LAND_W * (1 + LAND_SPACING_RANGE.max)));
    expect(Math.max(...slots.map((s) => s.x)) + LAND_W).toBeLessThanOrEqual(BATTLEFIELD_BOUNDS.width);
  });

  it('resserre aussi quand c’est l’air demandé qui ne tient pas', () => {
    // Quarante terrains sur une seule rangée à +30 % réclameraient 4 291 px
    // dans un panneau qui en fait 1076. Le pas cède, le cadre non.
    const slots = landSlots(anonymes(40), layout({ size: 1, spacing: 0.3 }));
    expect(slots[1]!.x - slots[0]!.x).toBeLessThan(LAND_W);
    expect(Math.max(...slots.map((s) => s.x)) + LAND_W).toBeLessThanOrEqual(BATTLEFIELD_BOUNDS.width);
  });

  it('ignore les noms : c’est l’ordre de pose qui commande', () => {
    const noms = landSlots(meles(12, ['Plains', 'Island']), layout({ size: 2 }));
    expect(noms).toEqual(landSlots(anonymes(12), layout({ size: 2 })));
  });
});

describe('landSlots — grille', () => {
  const grille = (over: Partial<LandLayout> = {}): LandLayout =>
    layout({ shape: 'grid', anchor: 'top-left', ...over });

  it('pose les colonnes côte à côte, sans chevauchement horizontal', () => {
    const slots = landSlots(anonymes(12), grille({ size: 4 }));
    // Quatre colonnes jointives à deux pixels près : la largeur d'une carte,
    // plus le liseré qui empêche deux voisines de se lire comme une seule.
    expect(slots[1]!.x - slots[0]!.x).toBe(LAND_W + 2);
    expect(new Set(slots.map((s) => s.x)).size).toBe(4);
  });

  it('écarte ou recouvre à la verticale d’exactement ce qu’on demande', () => {
    // `pasY = hauteurCarte × (1 + espacement)` : serré, c'est ce pas-là qui ne
    // laisse voir que le haut de chaque carte, nom compris ; desserré, c'est
    // une grille ordinaire.
    for (const spacing of [-0.6, -0.2, 0, 0.3]) {
      const slots = landSlots(anonymes(6), grille({ size: 2, spacing }));
      expect(slots[2]!.y - slots[0]!.y).toBe(Math.round(LAND_H * (1 + spacing)));
    }
  });

  it('descend toujours, même ancrée en bas — sinon on verrait le bas des cartes', () => {
    const slots = landSlots(anonymes(6), grille({ size: 2, anchor: 'bottom-left' }));
    // Le bloc colle au bord bas…
    expect(Math.max(...slots.map((s) => s.y)) + LAND_H).toBe(BATTLEFIELD_BOUNDS.height - 8);
    // …mais à l'intérieur, chaque carte est **plus basse** que la précédente :
    // peinte après, elle ne cache d'elle que le bas.
    expect(slots[0]!.y).toBeLessThan(slots[2]!.y);
    expect(slots[2]!.y).toBeLessThan(slots[4]!.y);
  });

  it('n’ouvre pas de colonne vide : le nombre réglé est un plafond', () => {
    const slots = landSlots(anonymes(3), grille({ size: 6 }));
    expect(new Set(slots.map((s) => s.x)).size).toBe(3);
    expect(new Set(slots.map((s) => s.y)).size).toBe(1);
  });

  it('resserre le pas vertical plutôt que de déborder', () => {
    const slots = landSlots(anonymes(96), grille({ size: 2, spacing: 0 }));
    // Quarante-huit rangées de 115 px feraient 5520 px dans 660 px de panneau.
    expect(slots[2]!.y - slots[0]!.y).toBeLessThan(LAND_H);
    expect(Math.max(...slots.map((s) => s.y)) + LAND_H).toBeLessThanOrEqual(BATTLEFIELD_BOUNDS.height);
  });

  it('part du coin demandé', () => {
    const droite = landSlots(anonymes(4), grille({ size: 4, anchor: 'top-right' }));
    expect(droite[0]!.x + LAND_W).toBe(BATTLEFIELD_BOUNDS.width - 8);
    expect(droite[1]!.x).toBeLessThan(droite[0]!.x);
  });
});

describe('landSlots — piles par type', () => {
  const piles = (over: Partial<LandLayout> = {}): LandLayout =>
    layout({ shape: 'piles-by-type', ...over });

  /** Le décalage diagonal lu sur deux cartes voisines d'une même pile. */
  const diagonale = (slots: ReturnType<typeof landSlots>, a: number, b: number): number =>
    slots[b]!.x - slots[a]!.x;

  it('réunit les cartes de même nom dans une pile, et les décale en diagonale', () => {
    // Entrée mêlée : A B A B A. La pile de A est faite des rangs 0, 2 et 4.
    const slots = landSlots(meles(5, ['Plains', 'Island']), piles());
    const pas = diagonale(slots, 0, 2);
    expect(pas).toBeGreaterThan(0);
    // Vers la droite **et** vers le bas, du même nombre de pixels.
    expect(slots[2]!.y - slots[0]!.y).toBe(pas);
    // La troisième Plaine est deux crans plus loin, pas un.
    expect(slots[4]!.x - slots[0]!.x).toBe(2 * pas);
    expect(slots[4]!.y - slots[0]!.y).toBe(2 * pas);
  });

  it('redistribue les positions dans l’ordre d’entrée', () => {
    const slots = landSlots(meles(5, ['Plains', 'Island']), piles());
    const pas = diagonale(slots, 0, 2);
    // Les Îles (rangs 1 et 3) forment une **autre** pile : même ligne, plus à
    // droite que ne va la diagonale de la première.
    expect(slots[1]!.y).toBe(slots[0]!.y);
    expect(slots[1]!.x).toBeGreaterThan(slots[0]!.x + 2 * pas);
    expect(slots[3]!.x - slots[1]!.x).toBe(pas);
    expect(slots[3]!.y - slots[1]!.y).toBe(pas);
  });

  it('ordonne les piles par première apparition, non par ordre alphabétique', () => {
    // « Swamp » est posé le premier : sa pile est la première, et « Forest »
    // la suivante — l'inverse de l'ordre alphabétique.
    const slots = landSlots(meles(4, ['Swamp', 'Forest']), piles({ anchor: 'top-left' }));
    expect(slots[0]!.x).toBeLessThan(slots[1]!.x);
  });

  it('laisse lire le nom des cartes du dessous, sur une main réaliste', () => {
    // Cinq types, huit exemplaires chacun : la base de mana d'un deck normal.
    // Au décalage par défaut, rien ne force le resserrement et le bandeau de
    // titre de chaque carte du dessous sort.
    const slots = landSlots(meles(40, ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']), piles());
    expect(diagonale(slots, 0, 5)).toBeGreaterThanOrEqual(15);
  });

  it('la diagonale se règle seule, sans rien devoir à l’espacement', () => {
    // C'est la séparation même : le même décalage sort de quatre espacements
    // différents, là où l'ancien réglage unique en donnait quatre.
    for (const spacing of [-0.6, -0.25, 0, 0.3]) {
      const slots = landSlots(meles(12, ['Plains', 'Island', 'Swamp']), piles({ spacing, diagonal: 18 }));
      expect(diagonale(slots, 0, 3)).toBe(18);
    }
  });

  it('l’espacement écarte les piles, sans rien devoir à la diagonale', () => {
    // Douze terrains, trois noms : trois piles de quatre, donc une empreinte de
    // 83 + 3 × 15 = 128 px de large. Le pas d'une pile à sa voisine est cette
    // empreinte plus l'écart réglé.
    const empreinte = LAND_W + 3 * 15;
    for (const [spacing, ecart] of [
      [0, 0],
      [0.12, 10],
      [0.3, 25],
    ] as const) {
      const slots = landSlots(
        meles(12, ['Plains', 'Island', 'Swamp']),
        piles({ spacing, diagonal: 15, anchor: 'top-left' }),
      );
      expect(slots[1]!.x - slots[0]!.x).toBe(empreinte + ecart);
      expect(diagonale(slots, 0, 3)).toBe(15);
    }
  });

  it('ne laisse jamais deux piles se recouvrir, quel que soit l’espacement', () => {
    /*
     * **C'est le seul endroit où l'espacement est bridé**, et il l'est parce
     * que deux piles qui se recouvrent sont illisibles : on ne voit plus où
     * l'une finit et l'autre commence, alors que le propre d'une pile est
     * d'être un paquet qu'on compte du regard.
     *
     * Le cas n'est pas théorique : l'espacement est **un seul champ pour les
     * quatre formes**, et son défaut vaut −25 %. Sans plancher, choisir « Piles
     * par type » sans avoir rien réglé donnerait des piles empilées les unes
     * sur les autres — un premier essai raté pour un réglage qu'on n'a pas
     * touché.
     */
    const empreinte = LAND_W + 3 * 15;
    for (const spacing of [-0.6, -0.25, -0.01, 0] as const) {
      const slots = landSlots(
        meles(12, ['Plains', 'Island', 'Swamp']),
        piles({ spacing, diagonal: 15, anchor: 'top-left' }),
      );
      // Jointives au plus serré, jamais chevauchées.
      expect(slots[1]!.x - slots[0]!.x, `espacement ${spacing}`).toBe(empreinte);
    }
  });

  it('une diagonale nulle empile exactement, et c’est permis', () => {
    // Le compte d'un coup d'œil est perdu, la place est gagnée : c'est le
    // marché, et il appartient au joueur.
    const slots = landSlots(meles(12, ['Plains', 'Island', 'Swamp']), piles({ diagonal: 0 }));
    expect(diagonale(slots, 0, 3)).toBe(0);
    expect(slots[3]!.y).toBe(slots[0]!.y);
  });

  it('descend en diagonale quel que soit le coin d’ancrage', () => {
    for (const anchor of LAND_ANCHORS) {
      const slots = landSlots(meles(6, ['Plains', 'Island']), piles({ anchor }));
      expect(slots[2]!.x).toBeGreaterThan(slots[0]!.x);
      expect(slots[2]!.y).toBeGreaterThan(slots[0]!.y);
    }
  });

  it('passe à la ligne quand la largeur ne suffit plus', () => {
    // Trente noms distincts : trente piles d'une carte, impossibles à aligner
    // sur 1060 px.
    const slots = landSlots(anonymes(30), piles({ anchor: 'top-left' }));
    expect(new Set(slots.map((s) => s.y)).size).toBeGreaterThan(1);
  });
});

describe('landSlots — piles de taille fixe', () => {
  const fixes = (over: Partial<LandLayout> = {}): LandLayout =>
    layout({ shape: 'piles-fixed', anchor: 'top-left', ...over });

  it('remplit dans l’ordre reçu, sans regarder les noms', () => {
    const melange = landSlots(meles(9, ['Plains', 'Island', 'Forest']), fixes({ size: 3 }));
    expect(melange).toEqual(landSlots(anonymes(9), fixes({ size: 3 })));
  });

  it('coupe les piles au nombre réglé', () => {
    // Sept terrains par trois : deux piles pleines, une d'une seule carte.
    const slots = landSlots(anonymes(7), fixes({ size: 3 }));
    const pas = slots[1]!.x - slots[0]!.x;
    expect(slots[1]!.y - slots[0]!.y).toBe(pas);
    expect(slots[2]!.x - slots[0]!.x).toBe(2 * pas);
    // La quatrième carte ouvre une pile : même ligne, au-delà de la diagonale.
    expect(slots[3]!.y).toBe(slots[0]!.y);
    expect(slots[3]!.x).toBeGreaterThan(slots[0]!.x + 2 * pas);
    // Et la septième en ouvre une troisième, au même écart que la deuxième.
    expect(slots[6]!.x - slots[3]!.x).toBe(slots[3]!.x - slots[0]!.x);
  });

  it('change de découpe quand on change le nombre', () => {
    const parDeux = landSlots(anonymes(8), fixes({ size: 2 }));
    const parQuatre = landSlots(anonymes(8), fixes({ size: 4 }));
    // Par deux, le rang 2 ouvre une pile ; par quatre, il est encore dans la
    // première et reste donc sur la diagonale.
    expect(parDeux[2]!.y).toBe(parDeux[0]!.y);
    expect(parQuatre[2]!.y).toBeGreaterThan(parQuatre[0]!.y);
  });
});

describe('les quatre formes rangent quatre fois différemment', () => {
  it('ne rend jamais deux fois le même rangement', () => {
    // La séparation des réglages touche les quatre formes à la fois : si l'une
    // se mettait à calculer comme sa voisine, aucune borne ne serait franchie
    // et rien d'autre ne le dirait.
    const lands = meles(12, ['Plains', 'Island', 'Swamp']);
    const rendus = LAND_SHAPES.map((shape) =>
      landSlots(lands, layout({ shape, anchor: 'top-left' }))
        .map((slot) => `${slot.x},${slot.y}`)
        .join(' '),
    );
    expect(new Set(rendus).size).toBe(LAND_SHAPES.length);
  });
});

describe('sanitizeLandLayout', () => {
  it('rend les défauts pour tout ce qui n’est pas une disposition', () => {
    for (const value of [null, undefined, 3, 'bottom-left', [], { rows: 'deux' }]) {
      expect(sanitizeLandLayout(value)).toEqual(DEFAULT_LAND_LAYOUT);
    }
  });

  it('accepte encore l’ancien nom du nombre, `rows`', () => {
    // Une préférence enregistrée avant les quatre formes ne doit pas se perdre.
    expect(sanitizeLandLayout({ rows: 3 }).size).toBe(3);
    expect(sanitizeLandLayout({ shape: 'grid', rows: 7 }).size).toBe(7);
    // `size` l'emporte quand les deux sont là : c'est le nom courant.
    expect(sanitizeLandLayout({ size: 1, rows: 4 }).size).toBe(1);
  });

  it('borne le nombre selon la forme retenue', () => {
    expect(sanitizeLandLayout({ shape: 'rows', size: 0 }).size).toBe(LAND_SIZE_RANGE.rows.min);
    expect(sanitizeLandLayout({ shape: 'rows', size: 40 }).size).toBe(LAND_SIZE_RANGE.rows.max);
    expect(sanitizeLandLayout({ shape: 'grid', size: 1 }).size).toBe(LAND_SIZE_RANGE.grid.min);
    expect(sanitizeLandLayout({ shape: 'grid', size: 99 }).size).toBe(LAND_SIZE_RANGE.grid.max);
    expect(sanitizeLandLayout({ shape: 'piles-fixed', size: 99 }).size).toBe(
      LAND_SIZE_RANGE['piles-fixed'].max,
    );
    expect(sanitizeLandLayout({ size: 2.6 }).size).toBe(3);
  });

  it('borne l’espacement et la diagonale au lieu de les refuser', () => {
    expect(sanitizeLandLayout({ spacing: -9 }).spacing).toBe(LAND_SPACING_RANGE.min);
    expect(sanitizeLandLayout({ spacing: 9 }).spacing).toBe(LAND_SPACING_RANGE.max);
    expect(sanitizeLandLayout({ diagonal: -5 }).diagonal).toBe(LAND_DIAGONAL_RANGE.min);
    expect(sanitizeLandLayout({ diagonal: 500 }).diagonal).toBe(LAND_DIAGONAL_RANGE.max);
    // Le décalage est en pixels : un dixième de pixel ne veut rien dire une
    // fois les coordonnées arrondies.
    expect(sanitizeLandLayout({ diagonal: 12.4 }).diagonal).toBe(12);
    // Et l'espacement au centième, parce qu'un curseur HTML rend volontiers
    // -0.30000000000000004 : ce qu'on enregistre est ce que le libellé montre.
    expect(sanitizeLandLayout({ spacing: -0.1 - 0.2 }).spacing).toBe(-0.3);
  });

  it('ne garde une forme et un ancrage que s’ils existent', () => {
    expect(sanitizeLandLayout({ shape: 'grid' }).shape).toBe('grid');
    expect(sanitizeLandLayout({ shape: 'en-spirale' }).shape).toBe(DEFAULT_LAND_LAYOUT.shape);
    expect(sanitizeLandLayout({ anchor: 'top-right' }).anchor).toBe('top-right');
    expect(sanitizeLandLayout({ anchor: 'middle' }).anchor).toBe(DEFAULT_LAND_LAYOUT.anchor);
  });

  it('laisse passer une disposition valide sans la toucher', () => {
    const valide: LandLayout = {
      shape: 'piles-fixed',
      size: 5,
      anchor: 'bottom-right',
      spacing: 0.15,
      diagonal: 22,
    };
    expect(sanitizeLandLayout(valide)).toEqual(valide);
  });

  it('assainit aussi ce qu’on passe à la géométrie, plutôt que de le croire', () => {
    // Un réglage hors bornes ne doit pas produire une géométrie hors cadre.
    const slots = landSlots(anonymes(120), {
      shape: 'rows',
      size: 99,
      anchor: 'nulle part' as never,
      spacing: 9,
      diagonal: 900,
    });
    expect(slots.length).toBe(120);
    expect(new Set(slots.map((s) => s.y)).size).toBe(LAND_SIZE_RANGE.rows.max);
    for (const slot of slots) {
      expect(slot.x + LAND_W).toBeLessThanOrEqual(BATTLEFIELD_BOUNDS.width);
    }
  });
});

/**
 * Ce que l'ancien réglage unique dessinait, relevé sur le code d'avant la
 * séparation : douze terrains, trois noms, `overlap: 0,25`. Un couple `x,y` par
 * terrain, dans l'ordre d'entrée.
 *
 * Des nombres écrits à la main plutôt qu'un calcul : un relevé que recalculerait
 * le code qu'il surveille ne surveille rien. Ceux-ci viennent de l'exécution de
 * la version d'avant, et ne bougeront plus.
 */
const AVANT: ReadonlyArray<readonly [LandShape, number, LandAnchor, string]> = [
  [
    'rows',
    2,
    'bottom-left',
    '8,537 70,537 133,537 195,537 257,537 319,537 382,537 444,537 506,537 568,537 631,537 693,537',
  ],
  [
    'grid',
    4,
    'top-left',
    '8,8 93,8 178,8 263,8 8,94 93,94 178,94 263,94 8,181 93,181 178,181 263,181',
  ],
  [
    'piles-by-type',
    4,
    'top-left',
    '8,8 146,8 284,8 23,23 161,23 299,23 38,38 176,38 314,38 53,53 191,53 329,53',
  ],
  [
    'piles-fixed',
    4,
    'top-left',
    '8,8 23,23 38,38 53,53 146,8 161,23 176,38 191,53 284,8 299,23 314,38 329,53',
  ],
];

describe('sanitizeLandLayout — la préférence enregistrée avant la séparation', () => {
  const douze = meles(12, ['Plains', 'Island', 'Swamp']);
  const rendu = (pref: unknown): string =>
    landSlots(douze, pref as LandLayout)
      .map((slot) => `${slot.x},${slot.y}`)
      .join(' ');

  it('lit l’ancien `overlap` comme un espacement négatif', () => {
    // « Chevauchement de 25 % » et « espacement de −25 % » sont le même
    // réglage ; oublier le signe rendrait de l'air à qui demandait du serré.
    expect(sanitizeLandLayout({ overlap: 0.25 }).spacing).toBe(-0.25);
    expect(sanitizeLandLayout({ shape: 'grid', overlap: 0.4 }).spacing).toBe(-0.4);
    expect(sanitizeLandLayout({ overlap: 0 }).spacing).toBe(0);
    // `spacing` l'emporte quand les deux sont là : c'est le nom courant.
    expect(sanitizeLandLayout({ spacing: 0.1, overlap: 0.25 }).spacing).toBe(0.1);
  });

  it('en tire aussi la diagonale, par la formule d’alors', () => {
    // L'ancien réglage la pilotait à l'envers : plus de chevauchement voulait
    // dire moins de décalage.
    expect(sanitizeLandLayout({ overlap: 0 }).diagonal).toBe(20);
    expect(sanitizeLandLayout({ overlap: 0.25 }).diagonal).toBe(15);
    expect(sanitizeLandLayout({ overlap: 0.5 }).diagonal).toBe(10);
    // `diagonal` l'emporte de la même façon.
    expect(sanitizeLandLayout({ diagonal: 3, overlap: 0.25 }).diagonal).toBe(3);
  });

  it('rend aux piles l’écart qu’elles avaient, et non celui des rangées', () => {
    // Pour les piles, `overlap` ne disait rien de l'écart entre piles : il
    // valait dix pixels, fixes. Le convertir en −25 % les ferait se recouvrir
    // sous les yeux de quelqu'un qui n'a rien touché.
    expect(sanitizeLandLayout({ shape: 'piles-by-type', overlap: 0.25 }).spacing).toBe(0.12);
    expect(sanitizeLandLayout({ shape: 'piles-fixed', overlap: 0.5 }).spacing).toBe(0.12);
    expect(Math.round(LAND_W * 0.12)).toBe(10);
  });

  it('ne se laisse pas emporter par un `overlap` hors de ses propres bornes', () => {
    // Bornes d'alors, et non celles d'aujourd'hui : on reconstitue ce que
    // l'ancien code dessinait, lui qui bornait déjà à [0 ; 0,6].
    expect(sanitizeLandLayout({ overlap: -1 }).spacing).toBe(0);
    expect(sanitizeLandLayout({ overlap: 5 }).spacing).toBe(-0.6);
    expect(sanitizeLandLayout({ overlap: 5 }).diagonal).toBe(8);
  });

  it('ne change pas d’un pixel ce que l’ancien réglage dessinait', () => {
    for (const [shape, size, anchor, attendu] of AVANT) {
      expect(rendu({ shape, size, anchor, overlap: 0.25 })).toBe(attendu);
    }
  });

  it('ne le change pas davantage pour un chevauchement plus fort', () => {
    // Le cas qui prouve que la diagonale migre, et pas seulement l'espacement :
    // à 0,5, l'ancien code décalait de 10 px au lieu de 15.
    expect(rendu({ shape: 'piles-by-type', size: 4, anchor: 'top-left', overlap: 0.5 })).toBe(
      '8,8 131,8 254,8 18,18 141,18 264,18 28,28 151,28 274,28 38,38 161,38 284,38',
    );
  });
});

describe('isLandTypeLine', () => {
  it('reconnaît les terrains, de base ou non', () => {
    expect(isLandTypeLine('Basic Land — Plains')).toBe(true);
    expect(isLandTypeLine('Land')).toBe(true);
    expect(isLandTypeLine('Legendary Land')).toBe(true);
    expect(isLandTypeLine('Artifact Land')).toBe(true);
    expect(isLandTypeLine('Land Creature — Elemental')).toBe(true);
  });

  it('ne prend pas un sous-type pour un type', () => {
    // « Island » porte les quatre lettres de `land`, et il est partout.
    expect(isLandTypeLine('Creature — Island Fish')).toBe(false);
    expect(isLandTypeLine('Enchantment — Aura')).toBe(false);
    expect(isLandTypeLine('Creature — Human Wizard')).toBe(false);
  });

  it('tient encore quand le séparateur n’est pas le tiret cadratin', () => {
    // Le découpage des sous-types ne mord pas sur un tiret simple : c'est là
    // que la frontière de mot est la seule garde qui reste.
    expect(isLandTypeLine('Creature - Island Fish')).toBe(false);
    expect(isLandTypeLine('Basic Land - Island')).toBe(true);
  });

  it('regarde les deux faces d’une carte double', () => {
    expect(isLandTypeLine('Creature — Human // Land')).toBe(true);
    expect(isLandTypeLine('Land // Creature — Elemental')).toBe(true);
  });

  it('ne lève pas sur une ligne absente', () => {
    expect(isLandTypeLine(undefined)).toBe(false);
    expect(isLandTypeLine(null)).toBe(false);
    expect(isLandTypeLine('')).toBe(false);
  });
});
