/**
 * Sonde : captures d'une vraie partie à deux, pour juger la lisibilité.
 *
 *   node scripts/probe-lisibilite.mjs <dossier> [url-de-base] [largeur]
 *
 * Alice crée la table, Bob la rejoint ; quelques tours se jouent (terrain,
 * créature, fin de tour), puis Alice ouvre un scry, un surveil et un regard.
 * Chaque moment est capturé des deux côtés quand c'est utile.
 */
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? '.';
const BASE = process.argv[3] ?? 'http://localhost:3191';
const LARGEUR = Number(process.argv[4] ?? 1440);
const NL = String.fromCharCode(10);

const DECK_A = [
  '// Commander', '1 Selenia, the Cursed Heart', '// Deck',
  '12 Plains', '12 Swamp', '4 Sol Ring', '4 Arcane Signet',
  '4 Serra Angel', '4 Vampire Nighthawk', '4 Doom Blade', '4 Swords to Plowshares',
].join(NL);
const DECK_B = [
  '// Commander', '1 Omnath, Locus of Mana', '// Deck',
  '24 Forest', '4 Llanowar Elves', '4 Grizzly Bears', '4 Giant Growth',
  '4 Craw Wurm', '4 Rampant Growth', '4 Harmonize',
].join(NL);

const errors = [];
const browser = await chromium.launch({ headless: true });

async function joueur(nom) {
  const ctx = await browser.newContext({ viewport: { width: LARGEUR, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${nom} pageerror: ${String(e).slice(0, 160)}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${nom} console: ${m.text().slice(0, 160)}`);
  });
  return page;
}

async function asseoir(page, nom, deck) {
  await page.getByPlaceholder('Invité').fill(nom);
  await page.locator('textarea').first().fill(deck);
  await page.getByRole('button', { name: "S'asseoir à la table" }).click();
  await page.waitForFunction(
    () => {
      const s = window.__mtg?.getState();
      return Boolean(s?.mySeat) && (s.zoneCounts.get(s.mySeat + '|LIBRARY') ?? 0) > 0;
    },
    null,
    { timeout: 30000 },
  );
}

const shot = async (page, nom) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${nom}.png` });
  console.log('capture', nom);
};

/** Joue un terrain et, si possible, un non-terrain : un tour « normal ». */
async function jouerUnTour(page) {
  await page.evaluate(async () => {
    const s = window.__mtg.getState();
    const seat = s.mySeat;
    const send = s.send;
    send({ type: 'UNTAP_ALL', seat });
    send({ type: 'DRAW', count: 1 });
    await new Promise((r) => setTimeout(r, 400));
    const st = window.__mtg.getState();
    const main = [...st.cards.values()].filter((c) => c.zone.kind === 'HAND' && c.zone.seat === seat);
    const meta = (c) => window.__mtg.cardMeta?.(c.scryfallId);
    const estTerrain = (c) => /Land/.test(meta(c)?.typeLine ?? '');
    const terrain = main.find(estTerrain) ?? main[0];
    const autre = main.find((c) => c !== terrain && !estTerrain(c));
    let x = 200 + Math.floor(Math.random() * 400);
    for (const c of [terrain, autre].filter(Boolean)) {
      send({ type: 'MOVE_CARD', cardId: c.id, to: { seat, kind: 'BATTLEFIELD' }, x, y: 200 });
      x += 140;
    }
  });
  await page.waitForTimeout(500);
}

try {
  const alice = await joueur('Alice');
  const bob = await joueur('Bob');

  await alice.goto(`${BASE}/`);
  await alice.getByRole('button', { name: /obtenir le lien/i }).click();
  await alice.waitForURL(/\/rooms\//);
  const url = alice.url();
  await asseoir(alice, 'Alice', DECK_A);
  await bob.goto(url);
  await asseoir(bob, 'Bob', DECK_B);

  await alice.getByRole('button', { name: 'Lancer la partie' }).click();
  await alice.waitForFunction(() => window.__mtg?.getState().room?.status === 'PLAYING', null, { timeout: 15000 });
  await bob.waitForFunction(() => window.__mtg?.getState().room?.status === 'PLAYING', null, { timeout: 15000 });
  await shot(alice, '01-alice-debut');
  await shot(bob, '02-bob-debut');

  // La main de départ : Alice prend un mulligan, Bob garde.
  const ouverture = alice.locator('[data-test="opening-hand-bar"]');
  if (await ouverture.isVisible()) {
    // Fermer l'annonce éventuelle d'un Échap, pour voir le bandeau seul.
    await alice.keyboard.press('Escape');
    await alice.locator('[data-test="opening-mulligan"]').click();
    await alice.locator('[data-test="mulligan-bar"]').waitFor({ timeout: 8000 });
    await shot(alice, '01b-alice-apres-mulligan');
    await alice.locator('[data-zone$="|HAND"] img').first().click();
    await alice.locator('[data-test="mulligan-bottom"]').click();
    await alice.waitForTimeout(400);
    console.log('bandeau après garde :', await ouverture.isVisible() ? 'ENCORE LÀ' : 'parti');
  } else console.log('ÉCHEC - pas de bandeau de main de départ chez Alice');
  await bob.keyboard.press('Escape');
  if (await bob.locator('[data-test="opening-keep"]').isVisible()) await bob.locator('[data-test="opening-keep"]').click();
  else console.log('ÉCHEC - pas de bandeau de main de départ chez Bob');

  // Qui commence ? Le serveur le tire ; on joue dans l'ordre qu'il donne.
  const actif = async () => alice.evaluate(() => {
    const s = window.__mtg.getState();
    return s.turn.activeSeat === s.mySeat ? 'alice' : 'bob';
  });
  for (let i = 0; i < 6; i += 1) {
    const qui = (await actif()) === 'alice' ? alice : bob;
    await jouerUnTour(qui);
    if (i === 4) await shot(qui, '03-milieu-de-partie-actif');
    await qui.evaluate(() => window.__mtg.getState().send({ type: 'END_TURN' }));
    const suivant = qui === alice ? bob : alice;
    // L'instant du passage, vu par celui qui reçoit la main.
    if (i === 3) {
      await suivant.waitForTimeout(250);
      await suivant.screenshot({ path: `${OUT}/04-passage-de-tour-recu.png` });
      console.log('capture 04-passage-de-tour-recu');
      await qui.screenshot({ path: `${OUT}/05-passage-de-tour-donne.png` });
      console.log('capture 05-passage-de-tour-donne');
    }
    await alice.waitForTimeout(300);
  }

  // Ramener la main à Alice pour les consultations : elle consulte sa bibliothèque.
  const lib = { kind: 'LIBRARY' };
  for (const [mode, n, nom] of [['SCRY', 2, '06-scry-2'], ['SURVEIL', 2, '07-surveil-2'], ['PEEK', 3, '08-regard-3']]) {
    await alice.evaluate(
      ([m, k]) => {
        const s = window.__mtg.getState();
        s.send({ type: 'LOOK', zone: { seat: s.mySeat, kind: 'LIBRARY' }, count: k, mode: m });
      },
      [mode, n, lib],
    );
    await alice.locator('[data-test="look-modal"]').waitFor({ timeout: 8000 });
    const premiere = alice.locator('[data-test="look-card"]').first();
    if (mode === 'SCRY') await premiere.locator('[data-test="look-quick-bottom"]').click();
    if (mode === 'SURVEIL') {
      await premiere.locator('img').first().hover();
      await alice.keyboard.press('ArrowDown');
    }
    await shot(alice, nom);
    await alice.locator('[data-test="look-submit"]').click();
    await alice.waitForTimeout(400);
  }
  await shot(bob, '09-bob-fin');
  await shot(alice, '10-alice-fin');
  await alice.getByRole('button', { name: 'Voir toute la table' }).click();
  await shot(alice, '11-alice-toute-la-table');
} catch (e) {
  console.log('ERREUR', String(e).slice(0, 400));
} finally {
  console.log('--- erreurs console ---');
  console.log(errors.length ? [...new Set(errors)].slice(0, 12).join(NL) : 'aucune');
  await browser.close();
}
