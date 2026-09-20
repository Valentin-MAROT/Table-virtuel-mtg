/**
 * Le regroupement des compteurs à valeur absolue.
 *
 * Ce qui est vérifié n'est pas « une Map retient des valeurs », mais les quatre
 * points sur lesquels un appelant se trompe :
 *
 * - **cumuler veut dire garder le dernier**, et non additionner. C'est toute la
 *   différence avec `lifeBatch.ts`, qui cumule un écart : confondre les deux
 *   ferait de douze clics `+` un compteur à 78 ;
 * - **zéro est une valeur**, pas une absence. Remettre des dégâts à zéro est le
 *   geste de début de partie, et il doit s'afficher pendant qu'il attend ;
 * - **les clés ne se mélangent pas** : deux commandants du même adversaire sont
 *   deux compteurs distincts, les additionner serait faux au regard des règles ;
 * - **rien ne se perd au démontage** : quitter la table pendant le délai envoie
 *   ce qui attend, au lieu de l'oublier en silence.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubGlobal('window', {
  setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms) as unknown as number,
  clearTimeout: (id: number) => clearTimeout(id as unknown as NodeJS.Timeout),
});

const {
  COUNTER_BATCH_MS,
  flushAllCounters,
  flushCounter,
  pendingCounterValue,
  queueCounterValue,
  resetCounterBatch,
  subscribeCounterBatch,
} = await import('../src/lib/counterBatch.js');

interface Damage {
  type: string;
  value: number;
  commanderId?: string;
}

let sent: Damage[] = [];
const send = (intent: unknown): void => void sent.push(intent as Damage);

const damage = (commanderId: string) => (value: number) => ({
  type: 'SET_COMMANDER_DAMAGE',
  from: 'seat_1',
  to: 'seat_0',
  commanderId,
  value,
});

beforeEach(() => {
  vi.useFakeTimers();
  resetCounterBatch();
  sent = [];
});

afterEach(() => {
  resetCounterBatch();
  vi.useRealTimers();
});

describe('compteurs par lot', () => {
  it('n’envoie qu’une fois, la dernière valeur, après douze clics', () => {
    for (let n = 1; n <= 12; n++) {
      queueCounterValue('dmg:a', n, damage('a'), send);
      vi.advanceTimersByTime(100);
    }
    expect(sent).toHaveLength(0);
    expect(pendingCounterValue('dmg:a')).toBe(12);

    vi.advanceTimersByTime(COUNTER_BATCH_MS);
    expect(sent).toHaveLength(1);
    // Garder le dernier, et non additionner : douze clics font 12, pas 78.
    expect(sent[0]).toMatchObject({ type: 'SET_COMMANDER_DAMAGE', value: 12 });
    expect(pendingCounterValue('dmg:a')).toBeUndefined();
  });

  it('distingue zéro d’une absence', () => {
    queueCounterValue('dmg:a', 0, damage('a'), send);
    expect(pendingCounterValue('dmg:a')).toBe(0);
    expect(pendingCounterValue('dmg:b')).toBeUndefined();

    vi.advanceTimersByTime(COUNTER_BATCH_MS);
    // Une remise à zéro part bel et bien : elle n'est pas prise pour du vide.
    expect(sent).toEqual([expect.objectContaining({ value: 0 })]);
  });

  it('ne mélange pas deux commandants', () => {
    queueCounterValue('dmg:a', 3, damage('a'), send);
    queueCounterValue('dmg:b', 7, damage('b'), send);
    expect(pendingCounterValue('dmg:a')).toBe(3);
    expect(pendingCounterValue('dmg:b')).toBe(7);

    vi.advanceTimersByTime(COUNTER_BATCH_MS);
    expect(sent).toHaveLength(2);
    expect(sent.map((i) => [i.commanderId, i.value]).sort()).toEqual([
      ['a', 3],
      ['b', 7],
    ]);
  });

  it('repousse l’envoi tant que le joueur clique', () => {
    queueCounterValue('dmg:a', 1, damage('a'), send);
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(COUNTER_BATCH_MS - 1);
      queueCounterValue('dmg:a', i + 2, damage('a'), send);
    }
    expect(sent).toHaveLength(0);

    vi.advanceTimersByTime(COUNTER_BATCH_MS);
    expect(sent).toEqual([expect.objectContaining({ value: 21 })]);
  });

  it('vide tout au démontage, sans rien perdre', () => {
    queueCounterValue('dmg:a', 5, damage('a'), send);
    queueCounterValue('dmg:b', 9, damage('b'), send);

    flushAllCounters(send);
    expect(sent).toHaveLength(2);

    // Et le minuteur ne repasse pas derrière pour envoyer une seconde fois.
    vi.advanceTimersByTime(COUNTER_BATCH_MS * 2);
    expect(sent).toHaveLength(2);
  });

  it('prévient ses abonnés à la mise en attente comme à l’envoi', () => {
    let ticks = 0;
    const off = subscribeCounterBatch(() => void (ticks += 1));

    queueCounterValue('dmg:a', 2, damage('a'), send);
    expect(ticks).toBe(1);
    flushCounter('dmg:a', send);
    expect(ticks).toBe(2);

    // Vider ce qui n'existe pas ne réveille personne.
    flushCounter('dmg:a', send);
    expect(ticks).toBe(2);
    off();
  });
});
