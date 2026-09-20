# Reste à faire

Liste tenue à jour des demandes reçues et non encore livrées. Elle existe pour
qu'une interruption ne fasse rien perdre : ce qui est fait sort d'ici, ce qui
arrive y entre.

Dernière revue : 20 septembre 2026, au terme d'une **relecture ligne à ligne de ce
document contre le code**. Elle a trouvé quatre entrées qui décrivaient des défauts
**déjà corrigés** : les garder coûtait plus cher que de n'avoir rien écrit, puisqu'un
backlog qu'on prend en défaut cesse d'être lu. Elles sont rectifiées ci-dessous, et
non effacées — savoir qu'une entrée a menti vaut d'être dit une fois.

Revue précédente : 18 septembre 2026, après la session de corrections d'interface, la
pose du socle d'internationalisation, puis la livraison de « cascade et découvrir » —
qui a demandé d'**amender l'invariant fondateur** du projet (§1.1 de
`docs/protocol.md`) et dont les suites sont consignées ci-dessous.

## Demandé, pas encore livré

**Le choix de la langue des cartes** (français / anglais) est livré pour
l'**affichage** : les cartes s'affichent en français avec repli anglais dans
toutes les vues, et la langue est une préférence de compte modifiable en pleine
partie. La solution retenue n'est pas celle qui était envisagée ici — nous
n'ingérons pas un second bulk, nous **résolvons** l'impression traduite carte par
carte (`POST /api/cards/localized`), parce que chez Scryfall une carte française
est un objet distinct et non une variante d'URL. Voir `docs/i18n.md`.

**Ce qui reste de la demande d'origine, c'est la recherche.** L'ingestion ne garde
toujours que `lang = 'en'` (`CATALOG_LANGUAGE`), et rien n'indexe les noms
français : taper « Anneau » ne trouve rien. Le reste des manques est détaillé sous
« Décisions en attente et chantiers ouverts ».


## Interactions de table

Tout ce bloc (I1 à I8) est **livré et vérifié au navigateur** : chaque point est
exercé par une étape de `scripts/verify-ui.mjs`, contre la pile locale
(`docker compose up -d --build`, `http://localhost:3000`). Le détail est sous
« Fait récemment ».

| | Demande | État |
|---|---|---|
| I1 | Déplacer une étiquette déclenche « trop d'actions trop vite » | **fait** — déplacement local, ~6 intents/s au lieu de ~60 |
| I2 | Étiquettes et compteurs libres attachables à une carte | **fait** — menu de l'étiquette, accrochage au clic, décrochage |
| I3 | L'attachement de cartes ne fonctionne pas | **fait** — voir le diagnostic ci-dessous |
| I4 | Main débordant de l'écran | **fait** — resserrement puis défilement à la molette, sur le rail seul |
| I5 | Marque de sélection persistante après le lasso | **fait** — vérifié au navigateur, y compris pour les cartes de main |
| I6 | Indicateur de carte posée face cachée | **fait** — vérifié, et la bascule `M` ne ment plus |
| I7 | Dos de carte sur la pile de bibliothèque | **fait** — dos dessiné, remplacé par le dos configuré |
| I8 | Curseurs des autres joueurs au-dessus des cartes | **fait** — vérifié avec des cartes sur le terrain |

### Reste ouvert, hors de ce lot

| | Demande | État |
|---|---|---|
| U2 | Regrouper dégâts de commandant et taxe sur le modèle de `lifeBatch.ts`, et offrir une saisie directe | **fait le 20 septembre 2026** — `lib/counterBatch.ts`, six tests. La saisie directe couvre les **trois** nombres : vie, dégâts, taxe |
| U3b | ~~`MOVE_CARDS` n'a aucune entrée d'annulation~~ | **cette entrée était fausse** — `engine.ts` porte l'instantané du lot *et* son `undo`, avec la garde « un jeton détruit ne se recrée pas ». Vérifié le 20 septembre 2026 |
| U4 | ~~Reste 15 appels à `window.prompt`~~ | **le compte était faux** : il en restait **un**, et c'était du code mort — un `ask` déclaré dans `ZonePanel.tsx` et jamais appelé, le bouton utilisant déjà `askNumber`. Les 7 autres occurrences étaient des commentaires expliquant le remplacement. Le code mort est retiré : **plus aucun `window.prompt` dans le client** |
| U6 | ~~`DETACH` n'écrit aucune ligne de journal~~ | **cette entrée était fausse** — `engine.ts` l'écrit, et seulement si la carte était bien attachée. Vérifié le 20 septembre 2026 |
| U7 | `Ctrl+Z` annonce « plus rien à annuler » là où l'action n'était pas annulable, et aucun bouton n'existe | **fait le 20 septembre 2026** — la moitié serveur était déjà livrée (`IRREVERSIBLE_LABELS`) ; le bouton « ↶ Annuler » rejoint la barre d'actions. **Jamais grisé** : la pile d'annulation vit au serveur, et le griser d'après une supposition locale reviendrait à inventer un état |
| A1 | ~~Le socket n'attend aucun `pong` et ne détecte pas une coupure silencieuse~~ | **fait le 20 septembre 2026** — voir « Fait récemment » |
| U8 | ~~Le sélecteur d'impression n'a pas d'aperçu au survol à la table~~ | **fait et vérifié au navigateur le 20 septembre 2026** — voir « Fait récemment ». L'étape de recette exerce les trois conditions et la capture `ui-31b-apercu-impression.png` en fait foi |
| U9 | Les **menus contextuels sont morts dans le lecteur de replay** : le clic droit y est avalé, et rien n'apparaît à la place | **arbitré et fait le 20 septembre 2026** — le replay ne capte plus le geste (`readOnly` sur `Table` et `Hand`). L'autre sortie, des menus en lecture seule, a été **écartée** : `send` n'a pas de socket sous lui en replay et rend `null` en silence, si bien que réutiliser `CardMenu` donnerait une liste d'entrées qui ne font rien — pire que pas de menu. Le déplacement de caméra au bouton droit, lui, reste |

## Décisions arbitrées le 20 septembre 2026

Cette section s'appelait « Décisions en attente ». Elle ne l'est plus : **tout a été
tranché**, sur demande du propriétaire du projet. Chaque point porte sa décision, sa
raison, et — quand elle est différée — la **condition précise** qui la déclenchera. Une
décision différée n'est pas une décision non prise : c'est un ordre de passage, et il est
écrit ici pour qu'on n'ait pas à le rejouer.

Une entrée de plus s'est révélée **fausse** à la relecture (le point 5), portant à six le
nombre d'entrées que ce document donnait pour vraies et qui ne l'étaient pas.

### 1. Traduire le journal de partie — **différé, et l'ordre est fixé**

**Décision : non, pas maintenant — et pas avant le point 3.**

Ce n'est pas le prix qui l'emporte (une montée de `PROTOCOL_VERSION`, donc la déconnexion
de toutes les tables ouvertes), c'est **l'ordre**. L'interface, elle, n'est pas traduite :
ses libellés restent français quelle que soit la langue choisie. Traduire le journal
d'abord donnerait, pour un joueur en anglais, des cartes anglaises, une interface
**française** et un journal **anglais** — moins cohérent qu'aujourd'hui, pour le prix
d'une coupure. L'ordre est donc : **point 3, puis point 1**, dans une fenêtre de
déploiement creuse et annoncée, puisqu'il en faut une de toute façon.

La dette continue de courir, et il faut le redire : chaque fonctionnalité livrée en
français allonge la reprise — `resolveCascade` a ajouté une phrase à parties variables.
Ce n'est pas un argument pour trancher autrement, c'est l'intérêt de l'emprunt.

### 2. Les migrations Prisma — **oui, et seules, jamais avec autre chose**

**Décision : on les met en place, dans un changement qui ne contient rien d'autre.**

`prisma db push --accept-data-loss` sur la base de production est une arme chargée : la
sûreté des changements récents venait de leur **contenu** (une colonne à défaut, une table
neuve), pas du dispositif. Un renommage passerait par la même commande.

Ce qui a été décidé de **ne pas** faire aujourd'hui, et pourquoi : ne rien poser dans
l'arbre. Un dossier `migrations/` présent pendant que l'entrypoint fait encore `db push`
est un piège — Prisma change de comportement dès qu'il en voit un, et le demi-état serait
plus dangereux que l'état actuel. La procédure, à exécuter d'un bloc :

1. `prisma migrate diff --from-empty --to-schema-datamodel apps/server/prisma/schema.prisma --script` vers `apps/server/prisma/migrations/0_init/migration.sql` ;
2. sur la production, `prisma migrate resolve --applied 0_init` — déclare l'existant comme
   point de départ **sans rejouer** la création des tables ;
3. seulement alors, `docker/entrypoint.sh` passe à `prisma migrate deploy` ;
4. répété sur une copie de la base avant d'approcher la production.

### 3. Extraire les chaînes des 46 fichiers d'interface — **oui, c'est le prochain lot**

**Décision : oui, et c'est le prochain chantier d'ampleur.** Il débloque le point 1, il est
mécanique, et il est **tenu par le typage** — une clé absente, un paramètre manquant ou une
accolade perdue refusent de compiler (`docs/i18n.md` §4.2).

Il n'a pas été fait dans ce lot, et pour une raison qui vaut d'être écrite : 40 composants
et 6 écrans en un seul passage, sans recette navigateur intermédiaire, c'est précisément le
genre de changement qui casse un écran sans que rien ne le dise. Il se fait par paquets,
écran par écran, chacun repassé au navigateur.

### 4. Les lignes de type (`typeLine`) — **elles restent anglaises**

**Décision : non, on ne les traduit pas.** La raison tient et n'a pas bougé :
`LocalizedPrinting` ne porte pas ce champ, l'ajouter est un champ de plus à résoudre et à
persister, et le faire pour la seule ligne de type alors que le texte de règles reste hors
de portée **par choix de droits** donne une carte à moitié traduite. Une carte moitié
française moitié anglaise déroute plus qu'une carte anglaise.

À rouvrir seulement si le catalogue français est ingéré en entier un jour — auquel cas la
question ne se posera plus dans ces termes.

### 5. Le tri et le filtre des listes — **entrée fausse : c'était déjà fait**

**Cette entrée décrivait un défaut qui n'existait plus.** Elle affirmait que le filtre de
`ZonePanel.tsx` et celui de `LookModal.tsx` n'interrogent que le nom du catalogue, et
concluait : « Conséquence assumée : taper « Anneau » ne trouve rien dans son propre deck. »
Les deux passent en réalité le **nom imprimé** à `matchesCardQuery`, et la décision est
même documentée sur place, dans un commentaire de trente lignes en tête de `ZonePanel.tsx`.
Taper « Anneau » trouve.

**Ce qui reste vrai, et qui est autre chose** : le **tri** porte toujours sur le nom du
catalogue, et c'est délibéré — trier sur le nom imprimé ferait sauter les lignes sous le
curseur à mesure que les résolutions rentrent. **Décision : on n'y touche pas.** Quant à
l'ajout d'une carte à un deck, il tape `/api/cards/search`, qui n'indexe que l'anglais :
c'est la demande consignée en tête de ce document, pas celle-ci.

### 6. Le faux journal de `TablePreview` — **fait, contre l'avis de l'entrée**

**Décision : traduit tout de suite**, alors que l'entrée disait de le reprendre avec le
point 3.

La raison du changement d'avis : le défaut n'est pas un manque de traduction, c'est une
**vitrine qui montre une phrase que le produit ne fabrique jamais**. Trois lignes anglaises
sous un en-tête « Journal » français, quand le serveur n'écrit que du français. Les
tournures sont désormais celles d'`engine.ts` mot pour mot, et **les noms de cartes restent
anglais** — parce que c'est exactement ce que le joueur lira, le serveur cuisant les noms
anglais dans ses phrases (point 1). Une vignette dira « Passage fabuleux » pendant que le
journal dira « Fabled Passage » : c'est une incohérence **réelle**, et la vitrine a pour
métier de la montrer, pas de la farder.

Le test qui épinglait l'anglais (`vues-localisees.test.ts`) gardait contre « un nom français
au milieu d'une phrase anglaise ». Cette garde est **conservée et renforcée** : le journal
de décor ne doit contenir aucun `localizedCardName`. Le jour où le point 1 sera fait, ce
test tombera — et il devra tomber.

### 7. Les boutons « Impeccable » n'ont jamais rendu — **tranché : adoptés**

**Trouvé le 20 septembre 2026, absent de ce document jusque-là.**

`Toolbar.tsx` portait trois constantes de style contenant chacune **deux** littéraux :
l'ancienne valeur affectée, puis la nouvelle posée en dessous — une **expression morte**,
que JavaScript évalue et jette. Les commentaires avaient glissé avec, chacun décrivant la
constante suivante. Le produit affiche donc les anciens boutons depuis ce jour-là, en
annonçant les nouveaux juste au-dessus.

**Décision du 20 septembre 2026 : les valeurs Impeccable sont adoptées**, et vérifiées à
l'écran avant de l'être — c'était toute la condition. Deux corrections ont été
nécessaires pour qu'elles tiennent, et aucune n'était cosmétique :

- **`border-slate-750` n'existait pas.** Ni dans Tailwind, dont l'échelle `slate` saute de
  700 à 800, ni dans le thème du projet. La classe ne produisait donc **aucune règle**, et
  la bordure serait retombée sur le défaut de `preflight` : du gris pâle sur un panneau
  sombre. Plutôt que de rabattre la valeur sur `slate-700` et de changer le dessin voulu,
  le jeton manquant est **défini** dans `tailwind.config.js` — `#293548`, milieu exact de
  `slate-700` et `slate-800`. Vérifié dans le CSS produit :
  `border-slate-750{border-color:rgb(41 53 72)}`, là où la classe ne produisait rien.
- **`animate-pulse` est passé sous `motion-safe:`.** Un bouton qui pulse en permanence est
  exactement ce que les réglages « réduire les animations » existent pour éteindre. La
  variante garde l'effet pour tout le monde, sauf pour qui a demandé le contraire à son
  système. Vérifié : la règle est bien sous `@media(prefers-reduced-motion:no-preference)`.

Le trou d'outillage qui a rendu tout cela possible est **fermé**, dans les deux sens : voir
« Fait récemment ».

## Fait récemment

- **Les boutons Impeccable, et le trou d'outillage qui les avait laissés morts**
  (20 septembre 2026).

  Le dernier point ouvert est tranché : les valeurs Impeccable sont **adoptées**, après
  deux corrections sans lesquelles elles n'auraient pas tenu — un jeton `slate-750`
  inexistant, et une animation perpétuelle passée sous `motion-safe:`. Le détail est
  au point 7 ci-dessus.

  **Le dépôt a enfin un linter, et il est étroit.** `npm run lint` échouait au démarrage :
  le script existait, la configuration non. Elle existe désormais (`eslint.config.js`), et
  son jeu de règles est choisi sur **un seul critère — ce qui échoue en silence** : une
  expression sans effet, une condition qui ne varie pas, une clé dupliquée, un `finally`
  qui avale un retour. Rien sur les guillemets ni l'ordre des imports. `tsc` en mode strict
  couvre déjà le reste, et un linter bavard finit désactivé — ce qui est la seule façon
  certaine de ne plus rien attraper.

  Le premier passage a rendu **2 128 remarques**, dont 2 127 erreurs. Presque toutes
  étaient du bruit, et le dire importe parce que c'est exactement ainsi qu'un linter se
  fait abandonner le jour de son arrivée :

  - **2 000 `no-undef`** sur `window`, `document`, `URL` — ESLint ne lit pas les `lib` de
    TypeScript et croyait le client privé de navigateur. Règle éteinte : `tsc` attrape un
    identifiant inconnu et sait quel environnement s'applique à chaque fichier ;
  - **206 remarques dans de l'outillage tiers** livré sous `.claude/` et `.cursor/`, dont
    85 dans un seul bundle UMD minifié. Périmètre resserré ;
  - **19 « espaces irrégulières »** qui étaient de la **typographie française** — les
    insécables avant `: ? !`. La règle se tait désormais dans les chaînes, les gabarits,
    les commentaires et le texte JSX, et garde son intérêt là où il est réel : une espace
    exotique glissée dans du **code**.

  Restaient alors **deux erreurs, et les deux valaient le voyage** :

  - **`Admin.tsx` : un remplacement qui ne s'appliquait jamais.** `num()` normalise le
    séparateur de milliers de `toLocaleString('fr-FR')`, et cherchait **U+00A0**, l'espace
    insécable ordinaire — écrite en clair dans la source, donc invisible à la relecture.
    Or tout moteur à ICU moderne sépare par **U+202F**, l'insécable *étroite*. Mesuré :
    avant, `99 231` sortait avec son U+202F intact ; après, avec une espace ordinaire,
    ce que l'auteur voulait. Les deux points de code sont désormais écrits en
    échappement, parce qu'une espace exotique posée telle quelle ne se distingue pas
    d'une espace ordinaire et que le premier copier-coller la remplace en silence.
  - **`Shortcuts.tsx` : un commentaire coupait deux `case` adjacents.** `case 'g':` et
    `case 'Delete':` partagent volontairement `move('GRAVEYARD')` ; le commentaire posé
    **entre** les deux faisait lire l'enchaînement comme un `break` oublié. Il est remonté
    au-dessus des deux. Aucun changement de comportement — mais `noFallthroughCasesInSwitch`
    ne le voyait pas, et le prochain lecteur, lui, l'aurait mal lu.

  Résultat : **0 erreur, 4 avertissements**, tous des dépendances de hooks laissées en
  avertissement pour être reprises cas par cas.

  Côté TypeScript, **`noUnusedLocals` et `noUnusedParameters` sont activés** sur tout le
  dépôt. Seize points à traiter, dont un vrai défaut là encore : `TokenBucket.retryAfter`
  **ne lisait pas son paramètre `now`**. Le seau se recharge paresseusement à l'intérieur
  de `take`, si bien que `state.tokens` porte le solde du dernier appel à `take`, pas le
  solde courant : un compte bloqué à 0,2 jeton s'entendait dire « une seconde » une minute
  plus tard encore, alors que son seau était plein. Les **quatre routes
  d'authentification** renvoyaient ce chiffre à l'utilisateur. La recharge est appliquée,
  **sans écrire** : demander quand on pourra réessayer ne doit ni consommer un jeton ni
  déplacer la date.

  Les neuf autres étaient dans `i18n/compile-checks.ts`, où l'inutilisé est **le but** :
  ce sont des assertions vérifiées par la compilation. TypeScript n'exempte pas les
  locales préfixées d'un `_` — seulement les paramètres —, elles sont donc exportées, ce
  qui les sort de la règle sans rien changer à ce qu'elles vérifient et sans les faire
  entrer dans le bundle.

  Enfin, deux remarques du contrôle de design sur `LookModal.tsx` (« texte gris sur fond
  coloré ») ont été **classées faux positifs, mesure à l'appui** : `text-slate-300` sur
  `bg-slate-900/90` et `bg-slate-950/80` donnent **12,0:1 et 13,6:1**, au-dessus du seuil
  AAA. `slate-900/950` est la surface neutre de toute l'application, pas un fond coloré.
  L'exception est enregistrée au fichier près.

  **Une intermittence de la recette, trouvée et fermée.** La seconde passe a rendu 101
  étapes vertes et **un échec** : « double-clic sur une carte de la sélection ». Comme la
  passe précédente était toute verte, le soupçon de régression était sérieux — `TOUT
  PASSE` ne s'imprime qu'à zéro échec, la comparaison était donc valide. Une **troisième
  passe sur le même build a rendu 102 étapes vertes**, ce qui tranche : intermittence, pas
  régression.

  La cause tient à l'étape elle-même. Elle double-cliquait sur `selection[1]`, c'est-à-dire
  sur **une carte tirée au sort** dans une sélection de neuf permanents que les places
  libres serrent les unes contre les autres. Quand ce second élément se trouvait à moitié
  caché sous sa voisine, Playwright refusait de cliquer — à juste titre : le point visé
  appartient à une autre carte. L'étape choisit désormais la première carte de la sélection
  qui **réponde vraiment en son centre**, et la rechoisit avant le second double-clic,
  puisque engager le groupe fait pivoter les cartes et déplace les recouvrements. La
  démonstration est identique — n'importe quelle carte de la sélection la porte —, mais
  elle ne dépend plus d'un tirage.

  C'est la pire sorte d'échec qui est fermée là : celui qu'on prend l'habitude de
  relancer.

- **Arbitrage de tous les points en attente, et le lot qui en découle**
  (20 septembre 2026).

  Le propriétaire du projet a demandé que **tout soit tranché**. C'est fait, et les
  décisions sont au-dessus, chacune avec sa raison et — pour celles qui sont différées —
  la condition qui les déclenchera. Trois ont été mises en œuvre dans la foulée, deux
  sont différées avec leur ordre de passage, une était fausse, et une septième a été
  découverte en chemin.

  Ce qui a été **livré** :

  - **U2 — les dégâts de commandant et la taxe partent enfin par lot.** Ils s'écrivaient
    par clic : encaisser douze dégâts produisait douze intents, douze events et douze
    lignes de journal, qui noient le reste de la partie. `lib/counterBatch.ts` reprend le
    modèle de `lifeBatch.ts` et **s'en sépare volontairement** : la vie cumule un
    **écart** (deux clics `−` valent `−2`), ces compteurs-ci gardent la **dernière
    valeur**. Fusionner les deux sémantiques aurait demandé un drapeau que chaque
    appelant doit lire juste, et le jour où il se trompe le compteur ment sans rien
    signaler. Six tests, dont celui qui vérifie que douze clics font 12 et non 78.
  - **U2 — la saisie directe, sur les trois nombres.** Vie, dégâts, taxe : le nombre se
    clique et s'ouvre en dialogue. Pour la vie, le total tapé part en **écart** et non en
    valeur — c'est `ADJUST_LIFE` qui existe, et le journal dit « passe à 28 (−12) », ce
    qui est justement l'information utile à la table.
  - **U7 — le bouton « ↶ Annuler ».** `Ctrl+Z` marchait depuis toujours, mais rien ne le
    disait. Il n'est **jamais grisé**, et c'est une décision : la pile d'annulation vit
    au serveur, avec sa fenêtre de dix secondes et sa liste d'actions irréversibles. Le
    griser d'après une supposition locale reviendrait à inventer un état, ce que ce
    client ne fait nulle part. On envoie, et le serveur répond précisément — « Mélanger
    la bibliothèque ne s'annule pas », « Quelqu'un a joué depuis » — dans le bandeau de
    refus, qui est fait pour être lu. C'est un meilleur retour qu'un bouton éteint et
    muet.
  - **U9 — le replay ne capte plus le clic droit.** Des deux sorties possibles, celle des
    menus en lecture seule a été **écartée pour une raison mesurable** : en replay, `send`
    n'a pas de socket sous lui et rend `null` en silence. Réutiliser `CardMenu` donnerait
    une liste d'entrées qui ne font rien — pire que pas de menu. Le geste revient donc au
    navigateur, où il a un sens utile à un spectateur (ouvrir l'image d'une carte). Le
    déplacement de caméra au bouton droit, lui, reste : il sert autant en replay qu'à la
    table.
  - **Point 6 — le journal de la vitrine passe au français**, contre l'avis de l'entrée
    qui demandait de le différer. Voir la décision ci-dessus : ce n'était pas un manque
    de traduction mais une vitrine montrant une phrase que le produit ne fabrique jamais.

  Et ce qui a été **trouvé sans être cherché** : `Toolbar.tsx` portait **trois
  restylages « Impeccable » qui n'ont jamais rendu quoi que ce soit** — chaque constante
  contenait deux littéraux, le second étant une expression morte. Le code mort est
  retiré **sans changer l'apparence** ; adopter ou non les valeurs Impeccable est le seul
  point laissé ouvert de ce document, parce qu'il se tranche en regardant et que
  personne ne les a jamais vues à l'écran.

  **Ce que l'outillage aurait dû attraper.** Trois défauts de ce lot et du précédent sont
  du code mort — les trois littéraux de `Toolbar.tsx`, le `window.prompt` d'`U4`, et les
  `shownDamage` / `shownTax` restés débranchés une heure pendant ce chantier même.
  `noUnusedExpressions` et `noUnusedLocals` les voient tous. Le dépôt **n'a pas de
  configuration ESLint** bien qu'il porte un script `lint` : `npm run lint` échoue au
  démarrage. Côté TypeScript, activer `noUnusedLocals` et `noUnusedParameters` coûte
  **14 corrections** sur le client, mesuré. C'est le prochain petit chantier, et il est
  décidé.

- **Relecture du backlog contre le code, et les quatre défauts qu'elle a fermés**
  (20 septembre 2026).

  La relecture a d'abord trouvé que **le document se trompait sur quatre entrées** :
  `MOVE_CARDS` avait son annulation, `DETACH` écrivait sa ligne de journal, la moitié
  serveur d'U7 était livrée, et les « 15 `window.prompt` » étaient un seul appel — du
  code mort par-dessus le marché. C'est le genre d'erreur qui se paie cher : on
  redéveloppe ce qui existe, ou l'on cesse de lire le document. Les entrées sont
  rectifiées à leur place plutôt qu'effacées.

  Puis les quatre défauts réels ont été corrigés :

  - **`lib/cards.ts` avait la structure de `cardLocalization.ts` sans sa garde.** Sur
    échec de `/api/cards/batch`, l'erreur était avalée puis les abonnés prévenus : ils
    re-rendaient, redemandaient la carte absente du cache, et l'on repartait trente
    millisecondes plus tard. **Mesuré : 331 appels là où il en fallait un**, depuis le
    navigateur de chaque joueur assis. Même repos de dix secondes que le module voisin.
    Le même bloc portait un second défaut, corrigé avec : 500 est le **plafond de la
    route**, et ce qui dépassait restait en vol sans lot pour l'emporter — les cartes
    au-delà de la 500ᵉ affichaient « … » jusqu'à ce qu'un identifiant neuf rouvre un
    lot par hasard.
  - **`RESOLVE_LOOK` ne vérifiait que l'appartenance, jamais l'unicité.** Une carte
    citée vers la réserve *et* vers le dessus partait en réserve puis se réinsérait en
    bibliothèque ; le remélange lui donnait un identifiant neuf, et la réserve gardait
    un identifiant qui ne désignait plus rien. Le chemin normal restait fermé — le
    `superRefine` d'`intentSchema` refuse ce doublon au bord du socket — mais
    **l'invariant « un objet est dans une zone et une seule » ne doit pas dépendre
    d'une validation de frontière**, ce que l'arrivée tardive de `toSideboard` avait
    déjà démontré. La garde est désormais dans le moteur, et son test l'y attrape en
    passant par `handleIntent`, qui ne repasse pas par le schéma.
  - **Le socket client ne surveillait pas ses propres pings.** Le serveur compte les
    pongs manqués et ferme un client muet ; l'inverse n'existait pas. Or une coupure
    n'est pas toujours une fermeture : une veille, un NAT qui oublie sa translation, un
    changement de réseau laissent la connexion **à moitié ouverte** — `readyState`
    reste `OPEN`, `onclose` ne part jamais. La table paraissait vivante pendant que
    chaque intent tombait dans le vide, sans bandeau de reconnexion. Même budget que
    le serveur (`missedPongsBeforeClose`), et n'importe quelle trame reçue vaut preuve
    de vie, pas seulement un `pong`.
  - **`deploy.sh` criait au loup à chaque passage.** La vérification finale est bonne
    — la montée en WebSocket doit répondre 101 — mais **quand elle réussit**, curl n'a
    plus de réponse à terminer et sort en 28 sur son `-m 10` ; `set -euo pipefail`
    faisait le reste, et `✓ Déployé` n'était jamais écrit. Le script lit maintenant le
    code et n'échoue que s'il n'est pas 101, le timeout devenant le cas **nominal**.
    Vérifié pour de bon, contre un serveur local qui répond 101 puis se tait : curl
    écrit bien `101` en sortant sur timeout. Les deux cas d'échec — proxy qui ne
    relaie pas l'`Upgrade` (200), serveur injoignable (000) — échouent toujours.
  - **`npm run ingest -- --force` ne forçait rien, en silence.** L'alias racine se
    termine désormais par `--`, sans quoi npm avalait le drapeau comme un des siens et
    le script répondait « Bulk déjà ingéré, rien à faire » à qui venait précisément de
    passer `--force`. **Mesuré avant/après** sur une sonde qui imprime son `argv`.
    `README.md`, l'en-tête d'`ingest-cli.ts` et la section « Déploiement » ci-dessous
    suivent.

  Enfin, **le sélecteur d'impression agrandit la vignette survolée** (U8). Trois choses
  devaient bouger ensemble, et le commentaire qui défendait le manque les avait
  identifiées sans les faire : le voile descend de `z-50` à `z-40` pour passer **sous**
  l'aperçu (`z-[45]`) comme la recherche de jeton et la consultation ; le sélecteur est
  monté par `Room.tsx` au lieu d'être rendu *par* `CardMenu`, qui restait sinon posé
  dans le store et faisait refuser `hoverPreview` ; et **aucune seconde instance
  d'aperçu n'est montée**, l'unicité de `data-test="card-preview"` étant ce que la
  recette compte. Au passage, la garde « un voile modal est-il resté ouvert ? » de la
  recette cherchait `.z-50` : elle serait restée verte en cessant de surveiller le
  sélecteur descendu à `z-40`. Elle le nomme désormais.

  **La recette a été rejouée en entier** contre une pile locale reconstruite et un
  catalogue de 118 609 cartes : **tout passe**, la nouvelle étape d'U8 comprise. Elle
  exerce les trois conditions ensemble — la source de l'aperçu vaut `printing`, il n'en
  existe **qu'un seul** dans la page, et son plan est bien au-dessus du voile — puis
  vérifie qu'Échap referme le sélecteur sans laisser d'aperçu fantôme.

  Le correctif d'alias a lui aussi été prouvé sur le vrai script, avec une base peuplée :
  `npm run ingest` répond « Bulk déjà ingéré, rien à faire », et `npm run ingest --
  --force` repart. Avant, les deux disaient la même chose.

- **Cascade et Découvrir** (18 septembre 2026), et **l'amendement de l'invariant
  fondateur** qui va avec. Exiler du dessus jusqu'à une carte qui convient, remettre
  le reste dessous au hasard : la séquence est fastidieuse à la main, elle est
  désormais offerte en un clic.

  Elle fait **évaluer deux règles de Magic au serveur** — « est-ce un terrain ? », « la
  valeur de mana est-elle sous le seuil ? » —, ce que le projet affirmait partout ne
  jamais faire. Le choix a été d'**assumer et d'écrire la frontière** plutôt que de la
  cacher : le principe 5 de la §1 de `docs/protocol.md` est conservé mot pour mot, et
  la nouvelle **§1.1** dit où passe la ligne. *L'invariant interdit de refuser, pas
  d'assister.* Une assistance est acceptable si elle **n'interdit rien** (aucun code
  d'erreur nouveau), **n'impose rien** (le chemin manuel reste ouvert, rien ne se
  déclenche parce qu'une carte est jouée) et **ne conclut pas** (la carte trouvée reste
  à l'exil, le joueur en dispose). Ces trois propriétés sont le **critère de toute
  demande future** : une fonctionnalité qui en manque une arbitre, et n'est pas à
  discuter.

  Le prix est consigné sans être adouci : le **saut automatique des terrains** est le
  seul endroit où une erreur du serveur a une conséquence de règles — une ligne de type
  mal lue et la trouvaille passe à la trappe, en silence. Le garde-fou est que le
  journal nomme **toutes** les cartes exilées : la table voit et peut protester.
  Deux endroits où l'on a **refusé de décider** : une carte dont plusieurs faces portent
  un coût arrête la résolution au lieu d'être jugée, et « jouer sans payer son coût »
  n'existe pas sur une table sans pile — la carte reste à l'exil.

  Le catalogue stocke maintenant `Card.keywords`, et l'invariant de droits est
  **intact** : ce sont des noms de mécaniques publiés à côté d'`oracle_text`, pas
  dedans (le raisonnement complet est au §5 de `docs/i18n.md`). Le mot-clé **ne descend
  pas au moteur** — il voyage par le catalogue de cartes et ne sert qu'à remonter
  l'action dans un menu. **Une ré-ingestion forcée est obligatoire au déploiement** :
  voir « Déploiement » plus bas.

- **Le français officiel, vérifié carte par carte** (18 septembre 2026). Tout le
  vocabulaire Magic de l'interface était traduit **de mémoire**. La vérification est
  désormais mécanique : le `printed_text` d'une impression française chez Scryfall donne
  le libellé imprimé d'une mécanique, sa `printed_type_line` donne celui d'un
  sous-type. Rien n'entre au dépôt sans une carte pour l'étayer.

  Le glossaire de mécaniques passe de 87 à 145 entrées : Hexproof est **Défense
  talismanique**, Shroud **Linceul**, Ward **Parade**. Mais le gain principal est
  ailleurs : **17 traductions déjà en place étaient fausses** — Storm n'est pas
  « Tempête » mais **Déluge**, Madness **Folie**, Shadow **Distorsion**, Buyback
  **Rappel**, Kicker **Kick**. Deux d'entre elles étaient nuisibles : Recover et
  Scavenge tombaient tous deux sur « Récupération », et « Ombre » pour Shadow entrait
  en collision avec le type de créature Shade. Côté jetons, 19 types de créature
  étaient inventés : Rogue est **Gredin**, Shaman **Shamane**, Fungus **Fongus**,
  Minion **Mignon**, Faerie **Peuple fée**.

  **Une régression volontaire** : Phasing redescend de « Décalage » à l'anglais. Ses 12
  impressions françaises n'ont aucun texte imprimé, donc rien ne l'étayait. Il ne reste
  que quatre mécaniques en anglais, toutes pour cette raison vérifiée : Banding,
  Fading, Phasing, Gift. Un mot sans preuve vaut mieux qu'un mot inventé : c'est la
  règle du glossaire, et la table des refus documente chaque cas.

  **Une source unique, désormais.** `CardSprite.tsx` portait son propre lexique de
  sous-types, écrit à la main : le dialogue des marqueurs disait « Roublards » quand le
  jeton s'appelait « Gredin ». L'affichage passe par `tokenNames.ts` ; les anciens mots
  restent comme **synonymes de saisie**, parce que celui qui joue depuis dix ans tape le
  mot qu'il connaît. Une seule collision, tranchée en faveur de l'imprimé :
  « méduse » désigne le *Jellyfish*, dont c'est le terme, et non plus la *Gorgon*, qui
  garde « gorgone » et gagne « gorgonoïde ».

  Le `printed_text` se **lit** pour vérifier un mot ; il ne se garde pas. Aucune phrase
  de règles n'entre au dépôt — seulement des libellés de deux ou trois mots, de même
  nature que la ligne de type. Le §5 de `docs/i18n.md` rend la distinction explicite.

- **Report d'impression vers le deck du compte** (18 septembre 2026). Un changement
  d'impression fait en partie (`SET_PRINTING`) ne meurt plus avec la table : il
  redescend sur le deck (`apps/server/src/decks/printing-sync.ts`).

  Deux décisions à ne pas défaire par inadvertance. **On déplace une copie, pas
  toutes** : une ligne `DeckCard` porte une `quantity`, et c'est justement pour les
  cartes en plusieurs exemplaires — les terrains de base avant tout — qu'on change une
  impression, pour que les copies ne soient pas identiques. La ligne d'origine perd une
  unité, une ligne de la nouvelle impression en gagne une ; le total par carte est
  conservé, et comme on **fusionne** dans une ligne existante quand elle existe,
  changer puis se raviser ne fragmente pas le deck. **On retrouve la ligne par l'ancien
  `scryfallId`, jamais par l'oracle** : un deck peut légitimement contenir deux
  impressions de la même carte — c'est même ce que ce module fabrique —, et l'oracle ne
  les départage pas. Il ne sert que de garde-fou : si les deux impressions n'ont pas le
  même, on n'écrit rien, parce qu'on est alors en train de remplacer une carte par une
  autre.

  Un deck asservi à Archidekt ou Moxfield est **écrit sans être détaché** de sa source.
  `printing-sync.ts` touche la `DeckCard` sans passer par le chemin d'édition
  (`decks/edit.ts`, `detachFromSource`), donc sans remettre `source` à `MANUAL` ni vider
  `sourceUrl`. Le détachement automatique a été écarté : changer une illustration en
  partie est un geste léger, et couper un deck de sa source à cette occasion serait une
  conséquence lourde qu'on imposerait sans la demander.

  Cela laissait une resynchronisation effacer le choix en silence. **C'est résolu**, voir
  « Épinglage des impressions » ci-dessous. Le manque qui subsiste est ailleurs : le
  joueur devrait apprendre le report **sur le moment**, ce qui demande un event adressé
  à son seul siège.

- **Épinglage des impressions contre la resynchronisation** (18 septembre 2026).
  `persistImport` remplace le contenu d'un deck en bloc — `deleteMany` puis
  `createMany` —, donc une resynchronisation depuis Archidekt ou Moxfield effaçait tous
  les choix d'illustration faits à la main. Le module protégeait déjà `playmatUrl` et
  `cardBackUrl` pour cette raison exacte ; les impressions rejoignent cette liste.

  `DeckCard.printingPinned` marque la ligne **qui reçoit** la copie, dans les trois
  branches de `printing-sync.ts`. `decks/pinned-printings.ts` porte la réconciliation,
  en fonction pure : `persistImport` relit les lignes épinglées avant chaque effacement
  et les réapplique.

  Trois règles à ne pas défaire. **L'appariement se fait sur l'identité oracle et la
  zone**, pas sur le `scryfallId` — c'est justement l'impression qui diffère. **La
  quantité vient de la source, jamais de l'épingle** : la source décide du contenu du
  deck, l'épingle ne décide que de l'illustration, et une carte qui disparaît en amont
  emporte son épingle. **Une épingle que la source annonce déjà ne prélève aucune
  copie** : sans cette clause l'opération n'était pas idempotente et grignotait une
  copie à chaque passage.

  Deux conséquences connues. `saveDeckFromText` passe `preservePinnedPrintings: false`
  et fait donc tomber toutes les épingles du deck — il le faut, sinon réappliquer une
  épingle déferait la modification qu'on vient de taper et *retirer* une illustration
  depuis l'éditeur deviendrait impossible ; les impressions, elles, sont conservées,
  puisqu'elles sont dans le texte. Et quand la source liste elle-même l'impression
  épinglée en plusieurs exemplaires, la ligne se scinde : deux `DeckCard` de même
  `scryfallId|zone|isFoil` ne différant que par la marque, donc deux lignes identiques
  dans la liste texte régénérée. Cas rare ; l'alternative — marquer toute la ligne —
  sur-épinglait.

- **Session de corrections d'interface** (18 septembre 2026). Cadrage de la table
  (« Voir toute la table » ne cadre plus le décor, « Recentrer sur moi » cadre le
  panneau au pixel exact), mise en page étroite sous 900 px, attachements
  resserrés à 13 × 22 avec le pas entre frères abaissé en conséquence, aperçu de
  carte fixe en bas à gauche sans mémoire d'état, lignes de journal multi-cartes
  nommées et dépliables, éventail de main adverse sans plafond, marqueurs calculés
  (un seul marqueur posé, « Périmètre » réservé au mode figé). Le détail et les
  mesures sont dans `docs/ui-reference.md` ; les manques d'internationalisation
  qui subsistent sont sous « Décisions en attente et chantiers ouverts » ci-dessus.

- **Révélation permanente du dessus de bibliothèque** (16 septembre 2026).
  *Experimental Frenzy*, *Realmbreaker*, *Vizier of the Menagerie* : la carte du
  dessus reste visible et change à chaque pioche. Le choix porte sur les
  **destinataires** — soi seul, un adversaire, toute la table — et n'en cocher
  aucun arrête la révélation ; c'est le même geste dans les deux sens, une
  entrée « Arrêter » n'aurait été proposée qu'à moitié du temps.
  Ce qui rend la chose tenable est qu'elle n'est accrochée à **aucun intent** :
  la carte du dessus bouge sur `DRAW`, `MILL`, `EXILE_TOP`, `SHUFFLE`,
  `RESOLVE_LOOK`, `MULLIGAN`, `UNDO_LAST`, le départ d'un joueur… Tenir cette
  liste, c'est finir par l'oublier quelque part. Le serveur réconcilie donc en
  **un seul point**, `game/topReveal.ts`, appelé en fin de `Room.commit`, et
  n'émet que la différence — le cas courant ne coûte rien.
  L'invariant « les objets de bibliothèque n'ont pas d'identifiant publié »
  n'est pas affaibli : un seul identifiant sort à la fois, `SHUFFLE` les
  réattribue tous, et `CARD_HIDDEN` le reprend dès qu'il cesse d'être le dessus.
  L'exception est écrite et justifiée dans `docs/protocol.md` §6.5.
  À l'écran, la carte remplace le dos sur la pile du révélateur — compte de zone
  lisible par-dessus, aperçu agrandi au survol comme partout — et le
  propriétaire porte sur sa propre pile l'œil qui sert déjà de convention pour
  « cette carte est montrée », dont le titre nomme qui la voit : on ne joue pas
  de la même façon quand un adversaire lit son dessus. `PROTOCOL_VERSION` est
  monté à **3**, sans quoi un onglet resté ouvert afficherait en permanence une
  carte périmée. Dix tests serveur (`apps/server/test/top-reveal.test.ts`) et
  une étape à deux sièges dans `scripts/verify-ui.mjs` — la carte apparaît chez
  l'adversaire, change après une pioche, disparaît à l'arrêt.

- **Le joueur local est toujours en bas — sans casser le repère commun**
  (16 septembre 2026). La disposition des sièges reste une fonction pure du
  `seatIndex` : c'est elle qui rend les coordonnées de `CURSOR` interprétables,
  et nous l'avions déjà payé une fois. On tient donc **deux** dispositions —
  la partagée, dont parlent tous les messages, et l'affichée, qui n'est qu'une
  **réattribution des mêmes cases** — plus une traduction entre elles
  (`lib/seatView.ts`). Ce n'est pas une rotation de pixels : les cartes restent
  droites et aucun panneau adverse n'est à l'envers. Seuls les curseurs et les
  étiquettes flottantes traversent le réseau en coordonnées de monde ; tout le
  reste est déjà relatif au panneau.
  **La recette a attrapé deux erreurs de ma main** : d'abord son propre critère,
  devenu faux (elle comparait le repère de A au partagé, égaux jusque-là) — elle
  mesure désormais la vraie propriété, « le curseur tombe au même endroit du
  même panneau », à 0,3 % près dans les deux sens ; ensuite un `{...toView(...)}`
  diffusé dans un style qui attend `left`/`top`, qui collait tous les curseurs à
  l'origine du plan.
- **Le lasso ne prend que des permanents** (16 septembre 2026). Il balayait tout
  le DOM, et `[data-card]` ne distingue rien : l'aperçu posé sur une pile —
  cimetière, exil, commandement — et les cartes du rail de main entraient dans
  la prise. Le filtre porte désormais sur le **modèle**, pas sur le DOM.
- **Fond de table : l'arène illustrée** (16 septembre 2026). Fournie par le
  propriétaire du projet, elle remplace le dallage composé, qui reste en repli
  libre de droits (`localStorage 'mtg.fond' = 'dalle'`). Deux réglages tirés de
  l'usage : son rapport est respecté (un `100% 100%` l'aplatissait de moitié à
  un seul joueur), et sa taille est **fixe** — calée sur la grille à quatre
  sièges. Calquée sur la grille courante, la cour changeait d'échelle à chaque
  joueur qui s'asseyait.
- **La main d'un adversaire se voit** (16 septembre 2026) : un éventail de dos
  de carte en bord de son terrain, avec le nombre. Le compteur du bandeau se
  lit, mais il ne se **voit** pas — on ne sent pas la différence entre trois et
  sept cartes sans aller la chercher.

- **Marqueurs : valeur libre, côtés indépendants, mots-clés** (16 septembre
  2026). La valeur d'un marqueur était un **entier**, ce qui était trop étroit
  dans les trois sens : impossible d'écrire « X/X », impossible de régler la
  force sans l'endurance, impossible de poser « vol » sans un « 1 » à côté.
  `Label.value` devient du **texte libre**, et l'interface en découle : rien
  → un mot-clé ; `3` → un compteur ; `1/1` → une force et une endurance,
  **chacune avec ses propres − et +**. Le nom devient facultatif dès qu'il y a
  une valeur — un marqueur « 1/1 » se suffit — et le moteur refuse seulement le
  marqueur vide des deux côtés. Tous restent accrochables à une carte.
- **Une carte donnée passe sous le contrôle de qui la reçoit** (16 septembre
  2026). `controller` n'était jamais mis à jour : le dépôt avec Alt sur le
  terrain d'un adversaire — le geste « je te la donne » — la posait bien chez
  lui, mais `assertMayTouch` la lui refusait. Il la voyait sans pouvoir la
  bouger. Le contrôleur est désormais le siège dont la zone porte l'objet ;
  l'`owner`, lui, ne bouge pas, et la carte revient à son propriétaire dès
  qu'elle quitte le champ.
- **Lancer la partie repart d'une table nette** (16 septembre 2026). Tout ce
  qu'on a posé, mis au cimetière ou créé pendant la composition rentre dans la
  bibliothèque ; les jetons cessent d'exister ; les commandants regagnent leur
  zone. Et le compte de mulligans disparaît après le premier tour : il ne
  décrivait plus rien et restait affiché pour le reste de la partie.
- **Attachements : plus serrés, et enfin dans le bon ordre** (16 septembre
  2026). Toutes les cartes attachées à une même cible partageaient la même
  `depth`, donc le même `z-index` : leur empilement retombait sur l'ordre du
  DOM, sans rapport avec leur décalage. Le rang entre désormais dans le calcul.
  **Attention au plafond** : les curseurs des autres joueurs vivent à
  `z-index: 40` ; une première version partait de 100 et les faisait passer
  sous les cartes — la recette d'interface l'a vu immédiatement.
- **Divers, signalés en jouant** (16 septembre 2026) : la taxe de commandant ne
  garde plus l'ancienne carte après un changement de deck (elle est indexée par
  identifiant d'objet, et les objets venaient d'être supprimés) ; l'étagère à
  jetons se réordonne (deux flèches au survol, et non un glisser — le
  glissement sert déjà à poser le jeton sur la table) ; « Surveil 1 » et
  « Meuler 1 » au clic droit de la bibliothèque ; « Passer le tour » sort des
  menus et s'allume quand c'est à nous ; le clic droit d'une sélection propose
  de l'**aligner** ; un jeton porte une marque, sans quoi une copie était
  indistinguable de son original.

- **La resynchronisation relit vraiment la liste** (16 septembre 2026). La
  résolution des impressions, elle, était bien refaite à chaque import : chaque
  ligne est reprise, son `setCode`/`collectorNumber` rejoué, et les
  `DeckCard` entièrement reconstruits. Le défaut était en amont — le **payload
  Archidekt était servi depuis un cache de quinze minutes**. Changer l'édition
  d'une carte chez Archidekt puis resynchroniser dans la foulée rendait donc la
  liste d'avant, impressions comprises, et le bouton répondait « c'est fait »
  sans avoir rien relu. `resyncDeck` passe désormais `fresh: true`, qui
  court-circuite le cache. La politesse envers Archidekt reste assurée par la
  file plafonnée, qui limite le **débit** — elle n'a jamais exigé qu'on refuse
  de relire. La décision est extraite dans `shouldServeCache`, testée : elle ne
  se vérifie pas en regardant du code qui appelle le réseau.
  **Moxfield n'a pas ce traitement, et c'est délibéré** : l'accès y est accordé
  à titre de faveur, et servir le cache y est une règle posée
  (`docs/moxfield.md` §4), pas une optimisation qu'on peut lever.

- **Les emails sont habillés, et leurs liens cliquables** (16 septembre 2026).
  Ils partaient en texte brut : une URL nue que le client mail transformait en
  lien ou pas, selon son humeur. Ils portent désormais la marque, la plaque de
  carton et l'encre violette du site — et un vrai bouton.
  `mailTemplate.ts` est écrit **contre** les contraintes du courrier, pas en
  les ignorant : tout est en ligne (Gmail tronque, Outlook ignore et la plupart
  des clients retirent un `<style>`), la mise en page est un tableau (Outlook
  rend avec le moteur de Word), et le logo est un **PNG** — Gmail et Outlook
  suppriment les `<svg>` sans rien mettre à la place. Comme la plupart des
  clients bloquent les images distantes, **aucune information ne vit dans une
  image** : la marque est écrite à côté, et le rendu a été vérifié images
  bloquées. Le lien est à la fois un bouton et une URL recopiable, la version
  texte subsiste (les filtres anti-spam se méfient d'un message qui n'en a pas).
  Le troisième email — adresse déjà inscrite — était bâti à la main dans
  `routes.ts` ; il rejoint les deux autres. 19 tests verrouillent ces
  propriétés, qu'un rendu dans un navigateur ne montre pas.

- **Main et aperçu suivent la fenêtre** (16 septembre 2026). Les deux étaient
  figés : rail de 244 px avec des cartes à l'échelle 1, aperçu de 440 px de
  haut. Sur un portable de 768 px, la main mangeait un tiers de la hauteur et
  l'aperçu la moitié — au détriment du terrain, qui est pourtant ce qu'on
  regarde. Et à 440 px de haut, l'aperçu fait 317 px de large, **plus large que
  la colonne de gauche** (304 px) : il mordait sur la table.
  **La taille ne dépend que de la fenêtre, jamais du nombre de cartes** : la
  faire varier avec la main ferait changer de taille toutes les cartes à chaque
  pioche, et l'on viserait une carte qui bouge. La densité est déjà absorbée par
  le resserrement du recouvrement puis par le défilement du rail.
  `lib/handMetrics.ts` est partagé entre `Hand` et `Table` — deux calculs
  séparés auraient divergé, et la caméra aurait cadré sur une place que la main
  n'occupe pas. Mesuré : le rail tient entre 22 % et 26 % de la hauteur de
  1180×700 à 1920×1080.

- **Trois défauts signalés en jouant** (16 septembre 2026).
  1. *Charger un deck n'effaçait pas le précédent à l'écran.* L'état serveur
     était bien remis à neuf, mais **aucun event ne l'annonçait** : les clients
     gardaient les objets d'avant, et deux decks se superposaient. `loadDeck`
     émet désormais un `CARD_HIDDEN` par carte retirée et un `TOKENS_DESTROYED`
     pour les jetons — le même traitement que `standUp`.
  2. *Réimporter un deck Archidekt déjà importé* remontait la contrainte Prisma
     brute (`Unique constraint failed on (userId, source, sourceDeckId)`) pour
     un geste légitime. Réimporter une source connue vaut désormais
     **resynchronisation** : c'est ce que l'utilisateur voulait, il n'a pas
     demandé un second exemplaire du même deck. L'apparence du deck (tapis, dos)
     n'est pas touchée, comme pour `resyncDeck`.
  3. *Revenir à la table affichait le salon plusieurs secondes.* La cause du
     délai n'a **pas** été reproduite : trois mesures instrumentées en
     production donnent 162, 195 et 7 315 ms pour la même manipulation, et une
     poignée de handshakes WebSocket bruts y répondent en 120 ms — c'est donc
     intermittent et hors du client. Le symptôme, lui, est supprimé à la
     source : tant qu'on détient un `seatToken` pour cette table et que la
     reprise n'a pas abouti, la page annonce « Reprise de votre place » au lieu
     du salon. Montrer « choisissez un nom et un deck » à quelqu'un qui a déjà
     une main et un terrain était faux quelle qu'en soit la durée — et l'on
     pouvait s'y asseoir une seconde fois par-dessus soi-même.
- **Le nombre de cartes en main devient une pastille** (16 septembre 2026). Il
  s'écrivait « · 7 en main » en gris sur gris ; c'est pourtant l'information
  qu'on consulte le plus souvent chez l'adversaire — elle dit s'il a de quoi
  répondre.

- **Composer son deck depuis la table, avant le lancement** (16 septembre 2026).
  On s'asseyait avec une liste et plus rien n'était modifiable : il fallait
  quitter la table, éditer le deck, revenir. Le panneau « Mon deck » permet de
  changer de deck et de faire passer des cartes entre bibliothèque et réserve.
  **Le point dur était protocolaire** : le client ne connaît aucun identifiant
  de sa bibliothèque (§2.1), il ne pouvait donc désigner aucune carte à sortir.
  Le serveur publie désormais la bibliothèque **à son seul propriétaire et
  seulement en LOBBY** — rien n'est encore mélangé, la liste est celle qu'il
  vient de charger. Le corollaire est indispensable et implémenté :
  `START_GAME` **mélange** chaque bibliothèque en réattribuant tous les
  identifiants et en vidant `knownTo`, sans quoi le joueur entrerait en partie
  en connaissant ses dix prochaines pioches. `RESOLVE_LOOK` accepte en plus
  `toSideboard`, et le menu d'une carte de réserve existe enfin — elle s'y
  voyait sans qu'on puisse rien en faire.
- **Recherche de jetons : les variantes d'un même nom** (16 septembre 2026). Le
  Spirit 3/2 rouge-blanc « n'existait pas ». Il était en base, avec quatre
  impressions : la recherche ne gardait **qu'une impression par nom**, ce qui
  est juste pour une carte — un nom désigne une carte — et faux pour un jeton,
  où seize « Spirit » différents partagent le même nom. Un jeton est désormais
  identifié par nom + type + force/endurance + couleurs, la taille entre dans le
  texte interrogé (« spirit 3/2 » rend le bon en tête) et le sélecteur affiche
  taille et couleur.

- **Le dallage est une vraie texture, sous CC0** (16 septembre 2026). Le
  plateau dessiné rendait la géométrie mais pas la **matière** : ni grain, ni
  usure, ni éclat de bord. Il est remplacé par une photographie de dallage —
  « Large Floor Tiles 02 », Rob Tuytel, Poly Haven, **CC0** (domaine public,
  attribution non exigée ; provenance consignée dans
  `apps/web/public/table/PROVENANCE.md`). Elle est **sans couture** et répétée :
  le fond n'a donc plus de bord du tout, plus seulement un bord hors d'atteinte.
  Version 1K retenue contre la 2K — à la taille projetée la différence ne se
  voit pas, et 558 Ko est déjà le plus gros fichier du site. Restent dessinés :
  l'emblème gravé du centre et le cadre de l'aire de jeu, que seule
  l'application peut caler sur la disposition des sièges. **Le voile des
  playmats a été divisé par deux dans la foulée** : à 42 %/55 %, quatre
  panneaux couvraient la dalle entière et l'on ne voyait plus que quatre vitres
  sombres posées sur rien. Les cartes sont opaques, elles n'ont jamais eu
  besoin de ce voile.
- **Fond de table : un plateau, plus un paysage** (16 septembre 2026). Le
  paysage d'aube avait un haut et un bas — donc un joueur bien placé et trois
  qui regardaient le ciel de côté. Le plateau est **radial**, il se lit pareil
  des quatre côtés. Tout est de la géométrie calculée (`tableBoard.tsx`) :
  aucun asset de Wizards of the Coast ni de Riot, être non commercial n'y
  changeant rien. Deux erreurs corrigées en route, l'une et l'autre visibles
  seulement en jouant : une rosace centrale se retrouvait **sous** le champ de
  bataille dès qu'on jouait à un ou deux (tout l'ornement est désormais bâti
  hors du rectangle de jeu, par construction et non par opacité) ; et un cadre
  placé à une fois et demie la demi-diagonale était **hors de l'écran** à la
  distance où l'on joue. Les dégradés sont exprimés en unités de monde : en
  pourcentage, sur 30 000 px, toute la transition tombe hors de vue et il ne
  reste qu'un aplat uni.
- **Ranger sa main** (16 septembre 2026). On glisse une carte de la main dans
  la main : une fente montre où elle va s'insérer, et elle s'y insère. « Trier
  la main » (menu Actions) range d'un coup — terrains, puis le reste par coût
  croissant. Un rangement n'écrit rien au journal : ce n'est pas une action de
  jeu. **Défaut de fond corrigé au passage** : repositionner une carte dans sa
  zone renumérote toutes les autres côté serveur (`reindexZone`), mais un seul
  `CARD_MOVED` ne parlait que d'elle — les clients gardaient le rang d'avant
  pour le reste de la zone, deux cartes se retrouvaient au même rang, et la
  main s'affichait dans un ordre que le serveur n'avait jamais décidé. Le
  serveur republie désormais l'ordre complet de la zone, et seulement pour les
  zones dont l'ordre est déjà public (`REORDERABLE_ZONES` : main, cimetière,
  exil, commandement, pile) — republier le sideboard ou une pile face cachée
  apprendrait des identifiants aux autres sièges.

- **Une table n'hérite plus de la précédente** (16 septembre 2026). « Créer une
  table » ne demandait plus ni nom ni deck : on atterrissait directement sur la
  table, déjà « assis », avec le panneau, le journal et les cartes de la table
  d'avant. **Pourquoi** : le store (`store/game.ts`) est global et survit à la
  navigation d'une page à l'autre, mais `connect(code)` ne remettait rien à zéro
  — il n'écrivait que `socket`, `roomCode` et `seq` — et `disconnect()` se
  contentait de fermer le socket. `RoomPage` n'affiche le salon que si `mySeat`
  est nul : un siège resté en mémoire lui faisait servir la table. Le troisième
  verrou manquait aussi : `applySnapshot` n'écrivait `mySeat` que si le serveur
  donnait un siège (`...(seat ? { mySeat: seat } : {})`), si bien qu'un snapshot
  de connexion **sans siège** — celui qu'on reçoit justement à une table où l'on
  n'a pas pris place (§13.4 du protocole) — laissait l'ancien siège intact.
  Livré : `blankRoomState()` appliqué à chaque `connect` et à chaque
  `disconnect`, `mySeat: seat` sans condition (le snapshot fait autorité), et
  `RoomPage` qui exige en plus `roomCode === code` pour la frame qui précède
  l'effet. Ce n'était **pas** l'état `closed` du salon ni son ternaire : établi
  au navigateur, `GET /api/rooms/:code` rend bien `closed:false` pour une table
  neuve, `closed` vaut `null` — donc faux — pendant le chargement, et le
  ternaire englobe le bon bloc. Le défaut ne se voyait qu'en **navigation SPA**
  (table → accueil → nouvelle table) : toute étape de recette qui créait sa
  table sur une page fraîchement chargée partait d'un store vierge, et c'est
  exactement pourquoi rien ne l'attrapait. Une étape de `verify-ui.mjs` couvre
  désormais ce chemin.
- **Quitter coûte un clic** (16 septembre 2026). Le premier clic n'était avalé
  par rien — le voile `z-40` passe bien sous le menu `z-50`, et il n'écoute que
  `click`, vérifié au navigateur : le menu s'ouvrait au premier clic et l'entrée
  agissait au second. C'était donc le geste qui était trop cher. « Quitter »
  est maintenant un bouton fendu : le mot s'absente tout de suite (siège tenu),
  le chevron d'à côté n'ouvre que ce qui est rare et irréversible — quitter pour
  de bon, clore la table. À trois entrées dont deux dangereuses, ouvrir le menu
  était surtout l'occasion de se tromper de ligne.
- **« Lancer la partie » ne promet plus ce que le serveur refuse**
  (16 septembre 2026). Le bouton était offert dès le salon, alors que
  `START_GAME` est rejeté tant qu'un siège n'a pas de deck chargé, et le
  chargement d'une liste est asynchrone. Il est désormais désactivé et nomme les
  sièges qu'on attend. C'est la même cause qui faisait échouer
  `scripts/probe-leave.mjs` **en production et pas en local** : la sonde
  attendait « Journal » — qui n'annonce qu'un siège obtenu — puis lançait la
  partie ; en production la résolution du deck prend une seconde de plus, le
  serveur répondait « Deck manquant : Invité·e. », la table restait en `LOBBY`
  et l'attente de `PLAYING` expirait sans dire pourquoi. Prouvé au navigateur en
  lisant `lastReject` après le clic — ce n'était ni la latence Cloudflare, ni le
  socket, ni l'ordre d'arrivée du snapshot. La sonde attend maintenant la
  bibliothèque de chaque siège, et les deux `deckName`, avant de lancer.

- **Application installable (PWA)** (16 septembre 2026). Manifeste complet
  (icônes 192/512 et masquables, raccourcis vers « mes tables » et « mes
  decks »), service worker, invite d'installation retenue et proposée depuis
  l'accueil. **Le worker ne met en cache que notre coquille** : tout ce qui vient
  d'une autre origine — les images de cartes de Scryfall au premier chef — et
  tout `/api` passent au réseau sans jamais être gardés. Un cache est une copie,
  et la règle permanente vaut aussi pour lui. `scripts/probe-pwa.mjs` le
  vérifie en inspectant le contenu réel des caches après deux visites.
- **Souris : le lasso au bouton gauche, la caméra au bouton droit**
  (16 septembre 2026). Le glisser du fond sélectionne, le bouton droit glissé
  déplace la table, et un clic droit sans déplacement ouvre le menu comme avant
  — c'est le mouvement qui distingue les deux. Le geste de caméra est capté en
  phase de **capture**, pour partir même d'une carte ; le menu contextuel qui
  suivrait est avalé une fois, à la racine.
- **La clôture d'une table est effective** (16 septembre 2026). Elle ne faisait
  qu'annoncer la fin : les joueurs continuaient de jouer et pouvaient revenir.
  `GameState.closed` — distinct de `status: 'ENDED'`, qui autorise encore une
  relance — fait refuser tout intent (`ERR_ROOM_CLOSED`), interdit de se
  rasseoir, survit au rechargement depuis la base, et le salon annonce « table
  close » au lieu d'offrir une chaise.

- **Mes tables, quitter pour de vrai, clore une table** (15 septembre 2026).
  « Quitter » ne faisait que ramener à l'accueil : le siège restait tenu, le
  deck posé, et rien ne permettait de retrouver une table depuis un autre
  appareil. Désormais : `GET /api/games` liste les tables où le compte a une
  place (et celles qu'il a ouvertes sans s'y asseoir, sinon un hôte perd la
  sienne en fermant son onglet) ; `POST /api/rooms/:code/leave` et
  `/close` font la même chose hors de la table. En table, `STAND_UP` accepte
  `force` — partir en pleine partie vaut concession, et s'il ne reste qu'un
  joueur la partie se termine — et `CLOSE_ROOM` clôt pour tout le monde,
  réservé au siège hôte. Le client oublie son `seatToken` quand c'est son
  propre siège qui part, faute de quoi il tentait de reprendre une place
  effacée au rechargement suivant.

- **I3 — pourquoi l'attachement ne fonctionnait pas.** Établi au navigateur,
  frames à l'appui : l'intent `ATTACH` **ne partait jamais**. L'unique chemin
  était l'entrée « Attacher à… » du menu contextuel, qui cherchait sa cible
  dans la sélection courante (`[...selection].find(id => id !== card.id)`) et
  refermait le menu sans rien envoyer quand il n'y en avait pas — c'est-à-dire
  presque toujours. Forcé à la main, le reste de la chaîne était sain : le
  serveur acceptait, `ATTACHED` revenait, le store écrivait `attachedTo`. Mais
  le rendu n'en montrait rien : la carte restait à sa place, au-dessus
  (`zIndex: 5`), reliée par une flèche pointillée traversant le panneau. Rien
  dans le geste ni dans l'image ne disait qu'un attachement avait eu lieu.
  Livré : un geste en deux temps (le menu arme, le clic gauche sur une autre
  carte exécute), un bandeau d'attente et un contour pointillé sur la source,
  `Échap` pour annuler, la carte attachée rangée **sous** sa cible avec un
  décalage de 26 × 54 px — elle reste visible aux deux tiers —, un badge
  « 🔗 N » sur la cible, la paire éclairée au survol, et le suivi automatique
  quand la cible se déplace. Les flèches ont été retirées : entre deux cartes
  désormais superposées, elles ne reliaient plus que deux points confondus.
  Tirer une carte attachée la détache, faute de quoi son déplacement n'aurait
  aucun effet visible.
- **I1** — `MOVE_LABEL` n'est plus émis à chaque `pointermove` : le déplacement
  est local pendant le geste (écrit dans le `transform`, hors de React), avec
  quelques positions intermédiaires étranglées à une toutes les 160 ms et une
  position finale au relâchement. Mesuré à la recette : **7 intents en 0,95 s**
  là où il en partait une soixantaine par seconde.
- **I2** — une étiquette s'accroche à une carte par son menu (clic droit), suit
  la carte sans qu'aucun intent ne parte, et se décroche en restant où elle
  est. Ses `x`/`y` deviennent un décalage relatif, converti à l'accrochage pour
  qu'elle ne saute pas. Le clic droit sur une étiquette ne la supprime plus
  sèchement : il ouvre un menu.
- **I4** — la main se resserre à mesure qu'elle grossit (26 → 116 px de
  recouvrement), puis défile à la molette. Défilement plutôt que deux rangées :
  une seconde rangée mange une carte de haut, oblige à choisir laquelle est
  « devant » au moment de glisser, et casse l'éventail où l'on repère ses
  cartes par leur rang. La molette n'est captée que sur le rail, et le zoom de
  la table est intact — les deux sont vérifiés dans la même étape.
- **I5, I6, I7** — vérifiés au navigateur. La sélection acquise garde son anneau
  bleu après le lasso, y compris sur les cartes de main, que le lasso balayait
  sans jamais les marquer. Le repère « face cachée » est visible sur une carte
  dont le propriétaire voit encore l'identité. La bibliothèque montre le dos
  dessiné, remplacé par le dos configuré dans les réglages de siège.
- **I8** — les curseurs passaient sous les cartes parce que les permanents
  portent un `z-index` et qu'un élément positionné sans `z-index` se peint
  dessous, quel que soit l'ordre du document. Les panneaux de siège ne créant
  aucun contexte d'empilement, un `z-index: 40` sur la couche de curseurs porte
  réellement : vérifié avec des cartes sur le terrain, pas sur un plateau vide.
- **Audit des retours (`docs/feedback-audit.md`), part client :** les six events
  ignorés par le store sont traités (`COMMANDER_TAX_CHANGED` — la taxe bougeait
  côté serveur pendant que le joueur lisait « +0 » —, `UNDONE`, `LOOK_STARTED`,
  `HAND_UNREVEALED`, `DICE_ROLLED`, `COIN_FLIPPED`), et le `default:` du
  commutateur avertit désormais en développement. Dé et pièce s'affichent au
  centre comme une bulle de chat. Le bandeau d'identité d'un siège porte « Tour
  N · à vous », « 👁 consulte sa bibliothèque » et « main révélée » — et la main
  révélée est **rendue** sur le panneau de son propriétaire, ce qui manquait
  entièrement. Un intent émis hors ligne n'est plus perdu en silence : `send()`
  rend `null` et le dit.
- **Cible de dépôt en direct.** `findDropTarget` est interrogé à chaque frame du
  glissement : la zone visée s'allume à la couleur de son siège, une pastille la
  nomme sous le fantôme, et un dépôt sans effet grise le fantôme. Un dépôt hors
  de toute zone le dit. Surtout, **poser une carte sur le terrain d'un voisin
  demande Alt** — la même touche que le lasso élargi : le serveur l'accepte, et
  on donnait sa carte sans le savoir. Tout cela est peint hors de React : le
  plan de table n'est pas re-rendu (0 rendu mesuré sur 40 déplacements).
- **Playmat par défaut translucide** : le fond de table se lit à travers, la zone
  reste délimitée par le liseré du siège. Un playmat configuré par un joueur
  reste, lui, opaque.
- **Coût du geste (`docs/ux-polish.md`), part client :** la main se sélectionne
  enfin (clic, Ctrl + clic, Maj + clic pour une plage) — défausser trois cartes
  coûte un intent et une ligne au lieu de trois ; un dépôt groupé hors champ de
  bataille part en un seul `MOVE_CARDS` ; « Jouer » cherche une place libre au
  lieu de reposer chaque carte en (60, 60) ; le menu du fond pose étiquettes et
  compteurs par un champ en place, qui garde la dernière saisie, au lieu de deux
  `window.prompt` ; détruire un jeton demande une confirmation.
- **Quatre joueurs.** `layout()` ne traite plus que 1 à 4 sièges : deux joueurs
  se font face en colonne, trois et quatre forment un carré. La recette remplit
  la table jusqu'au plafond et vérifie qu'aucun panneau n'en chevauche un autre.
- **Recette.** `scripts/verify-ui.mjs` couvre désormais **86 étapes**, toutes
  vertes contre la pile locale. Une étape qui échoue referme les modales avant
  de rendre la main : une assertion périmée faisait auparavant tomber vingt
  étapes saines. Trois assertions ont été mises à jour parce que le produit a
  changé, pas parce qu'elles gênaient : l'aperçu au survol est désormais
  **fixe** à gauche (on vérifie qu'il ne bouge plus), la bascule face cachée est
  une entrée unique, et l'assertion sur le fond accepte aussi bien un décor peint
  en couches CSS qu'en SVG inline — elle vérifie qu'il est **dessiné**, pas
  comment. C'est ce qui lui a permis de rester valable quand le décor est repassé
  au SVG inline pour le paysage.

- **Fond de table : un paysage d'aube, dessiné.** Remplace la pierre et la brume, qui
  étaient techniquement correctes mais ne racontaient rien — « on veut vraiment quelque
  chose de joli comme un immense paysage ». Ciel en dégradé, astre bas posé dans un col de
  la ligne de crête, cinq chaînes qui s'assombrissent vers l'avant, une eau lointaine, six
  terrasses qui descendent jusqu'à la table, un cours d'eau à gauche de la grille, et trois
  accents qui racontent sans rien citer : une tour, un pont, trois monolithes. Géométrie
  procédurale déterministe dans `tableScenery.ts`, peinture SVG dans `TableBackground.tsx`,
  aucun asset tiers. La substitution par `VITE_TABLE_BACKGROUND_URL` est conservée.
  Lisibilité : rien n'assombrit le paysage **hors** de la grille des sièges ; sous la
  grille, un halo et un aplat, auxquels s'ajoute le playmat translucide. Coût : 60 images/s
  pendant un glissement de table, au cadrage de jeu comme au dézoom maximal, table à
  quatre — aucun filtre SVG sur la surface du décor. Deux versions ont été rejetées avant
  celle-ci : la première posait l'horizon à 1 700 unités du centre, là où personne ne le
  voit jamais ; la seconde, corrigée sur la géométrie, restait trop sombre pour se lire.
  Détail complet dans `docs/ui-reference.md`, section « Fond de table ».
- **Recette : le libellé du bouton d'accueil.** `scripts/verify-ui.mjs` visait la chaîne
  exacte « Créer et obtenir le lien » ; le bouton s'appelle désormais « Créer la table et
  obtenir le lien » et **toute** la recette tombait à la première étape. Elle vise
  maintenant `/obtenir le lien/i`. Ce n'est pas une assertion assouplie : c'est un
  sélecteur qui ne dépend plus d'un libellé éditorial.
- Aide des raccourcis refaite : touches dessinées, deux familles en colonnes, en-tête et
  pied, fermeture évidente.
- **D1 — édition d'un deck carte par carte.** Un deck enregistré s'ouvre dans un
  éditeur (`Modifier`, page « Mes decks ») : quantité, zone
  (`Commander`/`Deck`/`Sideboard`), édition, marqueur foil, retrait, et ajout par
  recherche sur la base locale. Sous l'interface, rien de parallèle : l'éditeur
  renvoie ses entrées, le serveur les rend en liste texte et les repasse par le
  parseur, la résolution Scryfall et le rapport d'import — suggestions par
  distance comprises. L'aller-retour texte est couvert par un test dédié
  (`apps/server/test/deck-text.test.ts`).
  - Décision sur les decks synchronisés : **enregistrer une édition détache le
    deck de sa source**, et seulement sur demande explicite. Sans le drapeau,
    le serveur répond `409 SOURCE_SYNCED` et l'interface pose la question.
    Refuser sèchement obligerait à recréer le deck pour corriger une carte ;
    détacher en silence ferait disparaître le bouton « Resynchroniser » sans
    prévenir ; laisser la source en place condamnerait le travail à être écrasé
    à la prochaine synchronisation. Détacher sur confirmation est le seul des
    trois qui ne perd rien en silence, et il se défait à la main en réimportant
    l'URL.
- Déploiement complet : `https://magic.valentin-marot.fr`, conteneurs sur Serveur2,
  vhost et TLS sur Serveur, DNS Cloudflare, SMTP authentifié sur `noreply@valentin-marot.fr`.
- Dégâts de commandant : matrice complète en lecture, écriture réservée au receveur.
- `SCOOP` ne range plus le commandant, qui retourne en zone de commandement.
- Compteurs de joueur supprimables (valeur zéro), panneau dédié.
- Compteurs libres posables partout (étiquette portant une valeur).
- Changement de pseudo et de deck tant que la partie n'a pas commencé.
- Arrivée d'un joueur après le lancement de la partie.
- Option « Ranger les terrains » supprimée.
- Aperçu de carte au survol, ancré en bas à gauche.
- Lasso : le sélecteur DOM ne correspondait à rien, le lasso ne sélectionnait
  rien du tout. Corrigé.
- Journal : le repositionnement d'une carte dans sa propre zone n'est plus
  journalisé (« a déplacé X de champ de bataille vers champ de bataille »).

## Déploiement

La production est `https://magic.valentin-marot.fr`. **Autorisation permanente de
déployer une fois les fonctionnalités validées** (donnée le 15 septembre 2026) :
typage silencieux, tests verts, recette navigateur passée, puis
`bash scripts/deploy.sh`, qui vérifie lui-même la santé du service, le passage par
le reverse proxy et la montée en WebSocket.

Ne jamais déployer pendant qu'un chantier est en cours dans l'arbre de travail :
l'archive transférée emporterait des fichiers à moitié modifiés.

**Une étape de plus tant que `Card.keywords` n'est pas peuplé en production.** La
colonne est **neuve** : `prisma db push` l'ajoute sans rien détruire, mais elle reste
`null` sur toutes les lignes écrites avant elle — et `null` veut dire « on ne sait
pas », jamais « aucun mot-clé » (c'est pourquoi elle est `Json?` et non `String[]`).
Sans ré-ingestion, **aucune carte n'est détectée** comme portant cascade ou découvrir :
le raccourci ne remonte dans aucun menu, et la fonctionnalité a l'air de ne pas avoir
été livrée du tout. Après le déploiement, sur le serveur :

```sh
npm run ingest -- --force
```

Compter une **quarantaine de secondes**. Les deux formes marchent depuis le
20 septembre 2026 — `npm run ingest -w @mtg/server -- --force` reste valable. Avant
cette date, la forme courte ne faisait rien et le disait mal : npm avalait le drapeau
et le script répondait « Bulk déjà ingéré, rien à faire ». **Sur une production dont
le dépôt est antérieur, écrire la forme longue.** Rien n'est cassé entre-temps — le tiroir « actions assistées » reste offert
sur toutes les cartes, parce que ne pas savoir n'est pas une raison de dire non.

**Le `✓ Déployé` est de nouveau fiable** depuis le 20 septembre 2026 : `deploy.sh`
sortait en erreur sur sa dernière vérification quand celle-ci **réussissait**, et il
lit désormais le code HTTP au lieu du code de sortie de curl. Une sortie en échec
veut donc de nouveau dire quelque chose — `WebSocket : 101` doit s'afficher, et toute
autre valeur arrête le script.

## Décisions de périmètre

- **Quatre joueurs au maximum.** Le mode à huit est retiré (15 septembre 2026).
  `LIMITS.maxSeats = 4`. Le **mode Treachery** est envisagé pour plus tard, sans
  priorité ; il faudra alors revoir le plafond **et** la disposition des panneaux
  ensemble, pas l'un sans l'autre.

## Règles permanentes, à ne jamais enfreindre

- **Rien d'hébergé, rien de proxifié, rien de mis en cache** de Wizards of the
  Coast. Les faces de cartes et le dos officiel s'affichent — la politique de
  contenu de fan l'autorise pour un projet non commercial — mais toujours
  chargés depuis le CDN de Scryfall par le navigateur du joueur. Le dépôt n'en
  contient aucune copie. Tout ce qui n'est pas servi par un CDN public (habillage,
  fond de table, symboles de mana) reste une création originale.
- Les images de cartes sont chargées par le navigateur depuis Scryfall,
  jamais servies ni mises en cache par notre serveur.
- Les mots-clés de Magic restent en anglais (scry, surveil, mill, mulligan,
  sideboard) ; les termes officiels français existants sont utilisés ailleurs
  (engager, dégager, cimetière, exil, bibliothèque, commandant).
- Le client n'invente aucun état : il applique ce que le serveur diffuse. Seule
  exception autorisée, la prédiction locale de la §10 du protocole.
- Un deck appartient à un compte : la propriété se vérifie en base à partir de
  la session, jamais sur un identifiant fourni par le client.
- Éditer le contenu d'un deck le détache de sa source externe. Aucune édition
  manuelle ne survit sous un `sourceUrl` : ce serait du travail promis à
  l'écrasement.
  **Une exception existe depuis le 18 septembre 2026, et elle est consignée plutôt que
  tue** : le report d'impression fait en partie (`decks/printing-sync.ts`) écrit dans le
  deck **sans** le détacher. C'est un choix — couper un deck de sa source parce qu'on a
  changé une illustration serait une conséquence lourde pour un geste léger.
  L'exception ne coûte plus ce que cette règle annonce : `DeckCard.printingPinned` fait
  survivre le choix à la resynchronisation, et elle annonce combien d'impressions elle a
  conservées. Toute autre écriture dans un `Deck` reste tenue par la règle, et cette
  exception ne s'étend à rien d'autre.
- La disposition des sièges est une fonction pure du `seatIndex`, identique sur
  tous les clients : c'est ce qui rend les curseurs interprétables.
