/**
 * Ingestion manuelle : `npm run ingest -- --force`, depuis la racine.
 *
 * **Le `--` qui termine l'alias racine n'est pas décoratif, et il est fragile
 * au point de mériter cette note.** npm accole les arguments d'un `npm run x --
 * …` à la fin de la commande du script. Sans ce `--` final, l'alias racine
 * devenait `npm run ingest -w @mtg/server --force`, et npm **avalait le
 * drapeau comme un des siens** — il l'annonçait même, « using --force,
 * Recommended protections disabled ». Le script recevait alors une ligne de
 * commande vide, ne forçait rien, et répondait « Bulk déjà ingéré, rien à
 * faire » : le message le plus déroutant possible pour qui vient précisément
 * de passer `--force`. Le cas s'est produit en production, et a coûté une
 * recherche de panne là où il n'y en avait pas.
 *
 * `npm run ingest -w @mtg/server -- --force` contourne l'alias et marche
 * aussi. Dans un conteneur, `node apps/server/dist/cards/ingest-cli.js --force`
 * évite la question tout entière.
 *
 * `--repair-tokens` est la reprise d'une base déjà peuplée : elle relit les
 * lignes présentes pour corriger leur drapeau « jeton », sans retélécharger le
 * bulk. C'est la commande à passer sur une base existante après un changement
 * de la règle de reconnaissance des jetons.
 */
import { disconnect } from '../db.js';
import { backfillTokenFlags, ingestCards } from './ingest.js';

const force = process.argv.includes('--force');
const repairOnly = process.argv.includes('--repair-tokens');

async function main(): Promise<void> {
  if (repairOnly) {
    const fixed = await backfillTokenFlags();
    console.log(`${fixed} carte(s) reclassée(s) en jeton.`);
    return;
  }

  const result = await ingestCards({ force });
  console.log(
    result.skipped
      ? 'Bulk déjà ingéré, rien à faire. Relancer avec --force pour forcer.'
      : `${result.cardsUpserted} cartes ingérées en ${Math.round(result.durationMs / 1000)} s.`,
  );
  // Même après une ingestion complète, la reprise ne coûte rien et garantit que
  // les lignes plus anciennes que la règle courante ne restent pas mal classées.
  const fixed = await backfillTokenFlags();
  if (fixed > 0) console.log(`${fixed} carte(s) reclassée(s) en jeton.`);
}

main()
  .then(async () => {
    await disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await disconnect();
    process.exit(1);
  });
