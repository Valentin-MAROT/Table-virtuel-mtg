/**
 * Regroupement des compteurs à **valeur absolue**.
 *
 * Même problème que `lifeBatch.ts`, autre forme d'intent, et c'est pour cela
 * qu'il y a deux modules plutôt qu'un seul paramétré. La vie s'ajuste par un
 * **écart** (`ADJUST_LIFE`, `delta`) : deux clics `−` valent `−2`, et cumuler
 * veut dire additionner. Les dégâts de commandant et la taxe, eux, s'écrivent
 * en **valeur** (`SET_COMMANDER_DAMAGE`, `SET_PLAYER_COUNTER`) : cumuler veut
 * dire *garder le dernier*. Fusionner les deux sémantiques dans un module
 * commun demanderait un drapeau que chaque appelant devrait lire correctement,
 * et le jour où il se trompe, le compteur ment sans rien signaler.
 *
 * Le besoin, lui, est identique : encaisser 12 dégâts d'un commandant se fait
 * en douze clics, et douze intents produisent douze events et douze lignes de
 * journal, qui noient le reste de la partie. On accumule donc localement et
 * l'on n'envoie **qu'une fois le joueur arrêté** — un intent, une ligne.
 *
 * La valeur affichée pendant l'accumulation est une **prédiction locale** au
 * sens de la §10 du protocole : elle est remplacée par l'état serveur dès que
 * l'event revient. Les autres joueurs ne voient rien avant l'envoi.
 */
import type { Intent } from '@mtg/shared';
import { LIFE_BATCH_MS } from './lifeBatch.js';

/** Le même délai que la vie : c'est le même geste, il doit avoir le même repos. */
export const COUNTER_BATCH_MS = LIFE_BATCH_MS;

interface Pending {
  value: number;
  timer: number;
  /** Comment cette valeur se dit au serveur. Fourni par l'appelant, jamais deviné. */
  build: (value: number) => Intent;
}

type Send = (intent: Intent) => void;

const pending = new Map<string, Pending>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/** S'abonne aux changements des valeurs en attente, pour les afficher. */
export function subscribeCounterBatch(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/**
 * Valeur en attente d'envoi pour cette clé, `undefined` s'il n'y a rien.
 *
 * `undefined` et non `0` : zéro est une valeur parfaitement légitime — remettre
 * des dégâts de commandant à zéro est même le geste de début de partie — et la
 * confondre avec « rien en attente » ferait disparaître l'affichage prédit au
 * moment précis où il compte.
 */
export function pendingCounterValue(key: string): number | undefined {
  return pending.get(key)?.value;
}

/**
 * Enregistre une valeur. Le minuteur repart à chaque appel : tant que le joueur
 * continue de cliquer, rien ne part.
 */
export function queueCounterValue(
  key: string,
  value: number,
  build: (value: number) => Intent,
  send: Send,
): void {
  const current = pending.get(key);
  if (current) window.clearTimeout(current.timer);

  const timer = window.setTimeout(() => flushCounter(key, send), COUNTER_BATCH_MS);
  pending.set(key, { value, timer, build });
  notify();
}

/**
 * Envoie immédiatement la valeur en attente pour cette clé.
 *
 * Contrairement à la vie, **aucun cas ne se tait** : une valeur en attente est
 * toujours une valeur que le joueur a voulue. Un aller-retour `+` puis `−` la
 * ramène à son point de départ et l'envoie quand même — le serveur reconnaîtra
 * une écriture sans changement, ce qui coûte moins cher que de comparer ici à
 * un état que ce module ne connaît pas.
 */
export function flushCounter(key: string, send: Send): void {
  const current = pending.get(key);
  if (!current) return;

  window.clearTimeout(current.timer);
  pending.delete(key);
  send(current.build(current.value));
  notify();
}

/**
 * Envoie tout ce qui attend. À appeler au démontage de la vue : sans cela,
 * quitter la table pendant le délai perdrait le décompte en silence.
 */
export function flushAllCounters(send: Send): void {
  for (const key of [...pending.keys()]) flushCounter(key, send);
}

/** Vide tout, sans rien envoyer. Réservé aux tests et au démontage forcé. */
export function resetCounterBatch(): void {
  for (const { timer } of pending.values()) window.clearTimeout(timer);
  pending.clear();
  notify();
}
