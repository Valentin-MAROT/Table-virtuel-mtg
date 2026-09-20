/**
 * Le fourre-tout de préférences `UserPrefs.extra`, et la règle qui le rend sûr.
 *
 * `PATCH /api/me` **remplace `extra` en entier**. Tant qu'un seul réglage y
 * vivait — l'étagère à jetons —, relire et fusionner dans son coin suffisait.
 * Dès le deuxième, cela devient un défaut garanti : chaque module garde son
 * propre instantané du compte, si bien que le second à écrire fusionne sur un
 * `extra` **périmé** et efface ce que le premier venait d'y poser. Le joueur
 * range son étagère, choisit une disposition de terrains, et retrouve son
 * étagère vide au rechargement suivant — sans que rien n'ait échoué.
 *
 * Ce module tient donc **un seul** instantané, partagé, et sérialise les
 * écritures. Tout réglage qui vit dans `extra` passe par ici.
 *
 * Le mode invité reste entier : sans compte, chaque réglage garde son repli
 * `localStorage`, et ce module le dit simplement en rendant `null`.
 */
import { api, type Me } from './api.js';

/** Compte connu, `false` si l'on joue en invité, `null` : pas encore su. */
let account: Me | null | false = null;
/** La dernière écriture en vol : les suivantes s'y enchaînent. */
let queue: Promise<void> = Promise.resolve();

/** Le compte, chargé une fois. `null` en invité. */
async function knownAccount(): Promise<Me | null> {
  if (account !== null) return account === false ? null : account;
  try {
    account = await api.get<Me>('/api/me');
    return account;
  } catch {
    account = false;
    return null;
  }
}

/** Ce que `extra` contient aujourd'hui, jamais `undefined`. */
function currentExtra(): Record<string, unknown> {
  if (!account) return {};
  return (account.prefs?.extra ?? {}) as Record<string, unknown>;
}

/**
 * La valeur brute d'une clé d'`extra`, ou `undefined`.
 *
 * Elle est **brute** exprès : ce qui sort d'une API ou d'un stockage n'est
 * jamais digne de confiance, et c'est à l'appelant de la valider avec le
 * vérificateur qui connaît sa forme.
 */
export async function readAccountExtra(key: string): Promise<unknown> {
  const me = await knownAccount();
  if (!me) return undefined;
  return currentExtra()[key];
}

/** Joue-t-on avec un compte ? Ne déclenche aucun appel de son côté. */
export function hasAccount(): boolean {
  return account !== false && account !== null;
}

/**
 * Écrit une clé d'`extra`, en préservant les autres.
 *
 * Les écritures sont **mises à la file** : deux réglages enregistrés dans la
 * même seconde partiraient sinon avec le même `extra` de départ, et le second
 * effacerait le premier. Rien ne lève — un réglage qui ne s'enregistre pas ne
 * doit pas casser la table —, et chaque appelant garde son repli local.
 */
export async function writeAccountExtra(key: string, value: unknown): Promise<void> {
  const me = await knownAccount();
  if (!me) return;

  queue = queue.then(async () => {
    const extra = { ...currentExtra(), [key]: value };
    try {
      await api.patch('/api/me', { extra });
      if (account) {
        account = {
          ...account,
          prefs: { ...(account.prefs ?? { cardBackUrl: null, uiScale: 1 }), extra },
        };
      }
    } catch {
      // Le repli local de l'appelant a déjà pris : rien de visible n'est perdu.
    }
  });
  return queue;
}

/** Remise à zéro complète. N'existe que pour les tests. */
export function resetAccountExtra(): void {
  account = null;
  queue = Promise.resolve();
}
