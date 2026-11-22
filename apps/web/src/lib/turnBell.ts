/**
 * La cloche du tour : un tintement bref quand la main nous revient.
 *
 * **Synthétisée, pas enregistrée.** Deux partiels sinusoïdaux à l'attaque
 * franche et au déclin d'une seconde : assez pour rappeler l'oreille qui
 * regardait ailleurs, trop court pour agacer. Aucun fichier à servir, aucune
 * licence à suivre, et le volume se règle d'un nombre.
 *
 * **Le navigateur décide.** Un `AudioContext` ne joue qu'après un geste de
 * l'utilisateur sur la page ; à une table, on a toujours cliqué avant que son
 * tour arrive (s'asseoir, garder sa main). S'il refuse quand même, on se tait :
 * un son manqué n'est pas une panne.
 *
 * **Préférence de ce navigateur**, pas du compte : on peut vouloir la cloche
 * sur l'ordinateur du salon et pas au bureau. Le stockage peut manquer
 * (navigation privée) : la cloche reste alors active, réglage de la page.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'mtg.turnBell';
const listeners = new Set<() => void>();
let memory: boolean | null = null;

function read(): boolean {
  if (memory !== null) return memory;
  try {
    return window.localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

export function setTurnBell(on: boolean): void {
  memory = on;
  try {
    window.localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* stockage indisponible : la valeur vit le temps de la page */
  }
  for (const l of listeners) l();
}

export function useTurnBell(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    read,
  );
}

let ctx: AudioContext | null = null;

/** Joue la cloche si la préférence l'autorise. Ne lève jamais. */
export function ringTurnBell(): void {
  if (!read()) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.12;
    master.connect(ctx.destination);
    // Fondamentale et partiel inharmonique d'une petite cloche, le second plus
    // bref : c'est lui qui donne le « ting ».
    for (const [freq, level, decay] of [
      [1046.5, 1, 1.1],
      [2637, 0.35, 0.45],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(level, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      osc.connect(gain).connect(master);
      osc.start(now);
      osc.stop(now + decay + 0.05);
    }
  } catch {
    /* pas d'audio sur ce navigateur : on se tait */
  }
}
