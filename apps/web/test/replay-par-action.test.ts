/**
 * Le regroupement des pas de replay en **actions**.
 *
 * Un pas de replay est une **émission**, pas un geste. Un seul déplacement de
 * carte en produit plusieurs : le `CARD_MOVED` qu'on veut voir, puis les
 * `ZONE_COUNT` des deux zones touchées, puis au besoin un `CARD_HIDDEN` par
 * siège qui ne doit pas connaître l'identifiant. Mesuré sur une séquence
 * courte : **16 `ZONE_COUNT` sur 36 pas**, aucun ne portant de ligne de
 * journal. Avancer d'un pas tombait donc une fois sur deux sur une écriture de
 * comptabilité — on cliquait « suivant » et rien ne bougeait.
 *
 * Le regroupement s'appuie sur le fait que `Room.commit` calcule **un seul**
 * `at` pour toutes les émissions d'un même intent. C'est ce contrat-là que ces
 * tests gardent, du côté du lecteur.
 */
import { describe, expect, it } from 'vitest';
import { actionEnds, type ReplayStep } from '../src/store/replay.js';

/** Un pas réduit à ce que le regroupement regarde. */
const pas = (seq: number, at: number, actor: string | null): ReplayStep =>
  ({ seq, at, actor, event: { type: 'CARD_HIDDEN', cardId: 'x' } }) as unknown as ReplayStep;

describe('regroupement en actions', () => {
  it('ne rend aucune frontière pour un flux vide', () => {
    expect(actionEnds([])).toEqual([]);
  });

  it('referme une action à chaque changement d’horodatage', () => {
    // Trois émissions pour un geste, puis deux pour un autre.
    const steps = [
      pas(1, 1000, 'seat_0'),
      pas(2, 1000, 'seat_0'),
      pas(3, 1000, 'seat_0'),
      pas(4, 1500, 'seat_0'),
      pas(5, 1500, 'seat_0'),
    ];
    // Les frontières se lisent « nombre de pas appliqués » : 3 puis 5.
    expect(actionEnds(steps)).toEqual([3, 5]);
  });

  it('sépare deux sièges qui agissent dans la même milliseconde', () => {
    /*
     * Deux intents peuvent tomber sur le même `Date.now()`. Tant qu'ils
     * viennent de sièges différents, l'auteur les sépare — et c'est le cas qui
     * compte, puisqu'une table active fait agir plusieurs joueurs à la fois.
     */
    const steps = [pas(1, 1000, 'seat_0'), pas(2, 1000, 'seat_1'), pas(3, 1000, 'seat_1')];
    expect(actionEnds(steps)).toEqual([1, 3]);
  });

  it('traite les émissions sans auteur comme un geste à part', () => {
    // Le serveur émet aussi de son propre chef : `actor` vaut alors `null`.
    const steps = [pas(1, 900, 'seat_0'), pas(2, 900, null), pas(3, 900, 'seat_0')];
    expect(actionEnds(steps)).toEqual([1, 2, 3]);
  });

  it('referme toujours le dernier geste, pour qu’aucun pas ne reste orphelin', () => {
    const steps = [pas(1, 10, 'seat_0'), pas(2, 20, 'seat_0'), pas(3, 30, 'seat_0')];
    const ends = actionEnds(steps);
    expect(ends.at(-1)).toBe(steps.length);
  });

  it('rend des frontières strictement croissantes, jamais deux fois la même', () => {
    const steps = Array.from({ length: 50 }, (_, i) => pas(i + 1, Math.floor(i / 4) * 100, 'seat_0'));
    const ends = actionEnds(steps);
    for (let i = 1; i < ends.length; i++) expect(ends[i]!).toBeGreaterThan(ends[i - 1]!);
    expect(ends.at(-1)).toBe(50);
  });

  it('avance d’au moins un pas à chaque action : aucune frontière vide', () => {
    /*
     * C'est l'invariant dont dépend « suivant » : si une frontière ne faisait
     * pas progresser le curseur, le bouton resterait sans effet — le défaut
     * même qu'on ferme ici, sous une autre forme.
     */
    const steps = [pas(1, 1, 'a'), pas(2, 1, 'a'), pas(3, 2, 'a'), pas(4, 2, 'b')];
    let precedent = 0;
    for (const fin of actionEnds(steps)) {
      expect(fin).toBeGreaterThan(precedent);
      precedent = fin;
    }
  });
});
