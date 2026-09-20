/**
 * La réserve de mana flottant, et pourquoi elle n'a pas son propre intent.
 *
 * **Elle voyage par `SET_PLAYER_COUNTER`**, sous des `kind` préfixés
 * `mana:`. C'est le même chemin que la taxe de commandant (§6.6), et ce n'est
 * pas une économie de paresse : un intent neuf et un event neuf coûteraient une
 * montée de `PROTOCOL_VERSION`, donc la **déconnexion de toutes les tables
 * ouvertes** au déploiement — un prix sans rapport avec ce que la
 * fonctionnalité apporte. Le compteur de joueur porte déjà exactement ce qu'il
 * faut : un siège, un nom, un entier, diffusé à toute la table et rejoué à la
 * reconnexion.
 *
 * **Pourquoi la réserve est partagée plutôt que locale.** On aurait pu la tenir
 * dans le navigateur : elle est éphémère, elle se vide à chaque étape, et elle
 * sert d'abord à son propriétaire. Deux raisons l'emportent. D'abord la règle
 * du projet — *le client n'invente aucun état* — et une réserve de mana **est**
 * de l'état de jeu : c'est elle qui dit si un joueur peut répondre. Ensuite la
 * reconnexion : un rechargement de page au milieu d'un tour perdrait le compte,
 * et le joueur n'aurait aucun moyen de savoir ce qu'il avait. Le serveur la
 * détient donc, comme il détient tout le reste.
 *
 * **Ce que cela coûte, et qui est traité ailleurs** : `SET_PLAYER_COUNTER`
 * écrit une ligne de journal à chaque changement. Une réserve alimentée par
 * cinq terrains en écrirait cinq, puis cinq de plus en se vidant, pour une
 * information qui ne survit pas à l'étape en cours. Le moteur les tait donc
 * pour ce préfixe, et lui seul — voir `engine-2.ts`.
 */

/**
 * Les six réserves, dans l'ordre où une table les lit.
 *
 * `WUBRG` est l'ordre canonique de Magic, celui des coûts de mana imprimés et
 * des symboles ; l'incolore vient après, parce qu'il n'appartient à aucune
 * couleur. Cet ordre est celui de l'affichage et il n'a pas à être trié
 * ailleurs.
 */
export const MANA_POOL_SYMBOLS = ['W', 'U', 'B', 'R', 'G', 'C'] as const;

export type ManaPoolSymbol = (typeof MANA_POOL_SYMBOLS)[number];

/**
 * Le préfixe des `kind` de compteur qui portent du mana flottant.
 *
 * Il vit ici et nulle part ailleurs : le client le compose, le serveur le
 * reconnaît pour taire son journal, et les deux panneaux de sièges l'écartent
 * de leur liste de compteurs ordinaires. Quatre lectures, une seule définition.
 */
export const MANA_COUNTER_PREFIX = 'mana:';

/** Le `kind` de compteur d'une couleur. */
export function manaCounterKind(symbol: ManaPoolSymbol): string {
  return `${MANA_COUNTER_PREFIX}${symbol}`;
}

/**
 * Le symbole d'un `kind`, ou `undefined` si ce n'en est pas un.
 *
 * Le contrôle porte sur la **liste** et non sur le seul préfixe : un
 * `mana:quelquechose` fabriqué à la main — le dialogue des compteurs de joueur
 * accepte un nom libre — n'est pas une réserve et ne doit pas être traité comme
 * telle. Mieux vaut le laisser s'afficher tel quel, en toutes lettres, que de
 * le faire passer pour un symbole qu'il n'est pas.
 */
export function manaSymbolOf(kind: string): ManaPoolSymbol | undefined {
  if (!kind.startsWith(MANA_COUNTER_PREFIX)) return undefined;
  const rest = kind.slice(MANA_COUNTER_PREFIX.length);
  return (MANA_POOL_SYMBOLS as readonly string[]).includes(rest)
    ? (rest as ManaPoolSymbol)
    : undefined;
}

/** Est-ce une réserve de mana reconnue ? */
export function isManaCounter(kind: string): boolean {
  return manaSymbolOf(kind) !== undefined;
}
