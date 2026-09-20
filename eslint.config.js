// @ts-check
/**
 * Configuration ESLint — **étroite, et délibérément pas un linter de style.**
 *
 * Elle existe pour une raison précise et datée : `Toolbar.tsx` a porté pendant
 * des semaines trois restylages qui n'ont jamais rendu. Chaque constante
 * contenait deux littéraux — l'ancienne valeur affectée, puis la nouvelle posée
 * en dessous, en **expression morte** que JavaScript évalue et jette. Rien ne
 * pouvait le dire : `tsc` accepte une expression sans effet, et le dépôt portait
 * un script `lint` qui échouait au démarrage faute de ce fichier.
 *
 * Le jeu de règles est donc choisi sur un seul critère : **ce qui échoue en
 * silence**. Du code qui ne fait rien, une condition qui ne varie pas, une
 * comparaison qui ne compare rien, une promesse qu'on oublie d'attendre. Rien
 * sur les guillemets, les points-virgules ou l'ordre des imports : `tsc` en
 * mode strict, `noUnusedLocals` compris, couvre déjà le reste, et un linter
 * bavard finit par être désactivé — ce qui est la seule façon certaine de ne
 * plus rien attraper.
 *
 * Le typage n'est pas chargé (`projectService` reste éteint) : les règles
 * ci-dessous n'en ont pas besoin, et s'en passer garde `npm run lint` sous la
 * poignée de secondes qu'il faut pour qu'on le lance vraiment.
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    /*
     * Ce qui n'est pas du code de ce projet.
     *
     * Les deux familles sont différentes et méritent de l'être dites. Les
     * artefacts de construction ne sont écrits par personne. Les scripts sous
     * `.claude/` et `.cursor/`, eux, sont de l'**outillage tiers** livré avec
     * les skills — dont un bundle UMD minifié qui portait à lui seul 85 des
     * 236 remarques du premier passage. Les relire ne nous apprend rien : nous
     * ne les corrigerons pas, et leur bruit ferait abandonner le linter.
     */
    ignores: [
      '**/dist/**',
      '**/dist-types/**',
      '**/node_modules/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'apps/web/dev-dist/**',
      '.impeccable/**',
      '.claude/**',
      '.cursor/**',
      '.verify*/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      /*
       * Les dépendances de hooks sont un **avertissement**, pas une erreur, et
       * le greffon est là d'abord pour que les `eslint-disable-next-line
       * react-hooks/exhaustive-deps` déjà posés dans le code **résolvent** :
       * sans lui, ESLint échouait sur « règle introuvable » à chacun d'eux.
       * Une dépendance oubliée fige une valeur dans une fermeture sans rien
       * dire — c'est bien un échec silencieux —, mais la reprise se fait cas
       * par cas et non en bloc.
       */
      'react-hooks/exhaustive-deps': 'warn',
      /*
       * **La règle pour laquelle ce fichier existe.** `allowShortCircuit` et
       * `allowTernary` restent faux : `a && b()` et `x ? f() : g()` en position
       * d'instruction sont précisément les formes où l'on croit agir sans agir.
       */
      '@typescript-eslint/no-unused-expressions': 'error',

      // Une condition qui ne varie pas est une branche morte qui se croit vivante.
      'no-constant-condition': 'error',
      'no-constant-binary-expression': 'error',
      // Écrire une variable sur elle-même, comparer une valeur à elle-même :
      // toujours le vestige d'un renommage à moitié fait.
      'no-self-assign': 'error',
      'no-self-compare': 'error',
      // Deux fois la même clé dans un littéral : la seconde gagne, en silence.
      'no-dupe-keys': 'error',
      'no-unsafe-finally': 'error',

      /*
       * **Les espaces insécables sont de la typographie, pas une irrégularité.**
       * Le français en pose avant `: ? !` et dans les guillemets, et tout ce
       * dépôt est écrit en français. La règle garde son intérêt là où il est
       * réel — un espace insécable glissé dans du **code**, qui ressemble à une
       * espace et n'en est pas — et se tait dans les chaînes, les gabarits, les
       * commentaires et le texte JSX.
       */
      'no-irregular-whitespace': [
        'error',
        { skipStrings: true, skipTemplates: true, skipComments: true, skipJSXText: true },
      ],
      // Une promesse non attendue perd son erreur en route. `void` reste permis :
      // c'est la façon dont ce dépôt dit « je sais, et c'est voulu ».
      'no-unreachable': 'error',
      'no-dupe-else-if': 'error',
      'no-duplicate-case': 'error',
      'no-fallthrough': 'error',

      /*
       * Ce que `tsc` fait déjà mieux, et qui ferait double emploi en pire : les
       * variables inutilisées sont attrapées par `noUnusedLocals` et
       * `noUnusedParameters` (`tsconfig.base.json`), qui comprennent les types.
       */
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',

      /*
       * `no-undef` est éteint sur recommandation de `typescript-eslint`, et pas
       * par confort : ESLint ne lit pas les `lib` de TypeScript, si bien qu'il
       * déclarait « `window` n'est pas défini » deux mille fois dans un client
       * navigateur. `tsc` attrape un identifiant inconnu, lui, et il sait
       * lequel des deux environnements s'applique à chaque fichier.
       */
      'no-undef': 'off',

      /*
       * `any` est un sujet de conception, pas de peluche automatique. Le dépôt
       * est en `strict` et l'emploie à bon escient dans les frontières non
       * typées ; en faire une erreur ici ferait crier le linter là où la
       * décision est déjà prise et commentée.
       */
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
  {
    // Les scripts de recette et les sondes tournent sous Node, hors du client.
    files: ['scripts/**/*.mjs', 'e2e/**/*.ts', '*.config.{js,ts}'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', __dirname: 'readonly' },
    },
  },
);
