/**
 * Sonde : révéler les X cartes du dessus, vu des deux côtés.
 *
 *   node scripts/probe-revelation.mjs <dossier> [url-de-base]
 *
 * Alice révèle trois cartes, en prend une en main et valide ; on capture ce que
 * Bob voit pendant le choix, juste après la validation, puis quelques secondes
 * plus tard. On survole aussi une carte double face de la main d'Alice.
 */
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? '.';
const BASE = process.argv[3] ?? 'http://localhost:3191';
const NL = String.fromCharCode(10);
const DECK_A = ['// Commander', '1 Selenia, the Cursed Heart', '// Deck',
  '20 Plains', '10 Delver of Secrets', '10 Brutal Cathar', '9 Swamp'].join(NL);
const DECK_B = ['// Commander', '1 Omnath, Locus of Mana', '// Deck', '49 Forest'].join(NL);

const errors = [];
const browser = await chromium.launch({ headless: true });
async function joueur(nom) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${nom} pageerror: ${String(e).slice(0, 160)}`));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('401')) errors.push(`${nom} console: ${m.text().slice(0, 160)}`); });
  return page;
}
async function asseoir(page, nom, deck) {
  await page.getByPlaceholder('Invité').fill(nom);
  await page.locator('textarea').first().fill(deck);
  await page.getByRole('button', { name: "S'asseoir à la table" }).click();
  await page.waitForFunction(() => {
    const s = window.__mtg?.getState();
    return Boolean(s?.mySeat) && (s.zoneCounts.get(s.mySeat + '|LIBRARY') ?? 0) > 0;
  }, null, { timeout: 30000 });
}
const shot = async (page, nom) => { await page.screenshot({ path: `${OUT}/${nom}.png` }); console.log('capture', nom); };

try {
  const alice = await joueur('Alice');
  const bob = await joueur('Bob');
  await alice.goto(`${BASE}/`);
  await alice.getByRole('button', { name: /obtenir le lien/i }).click();
  await alice.waitForURL(/\/rooms\//);
  await asseoir(alice, 'Alice', DECK_A);
  await bob.goto(alice.url());
  await asseoir(bob, 'Bob', DECK_B);
  await alice.getByRole('button', { name: 'Lancer la partie' }).click();
  for (const p of [alice, bob]) {
    await p.waitForFunction(() => window.__mtg?.getState().room?.status === 'PLAYING', null, { timeout: 15000 });
    await p.waitForTimeout(600);
    await p.keyboard.press('Escape');
    const garder = p.locator('[data-test="opening-keep"]');
    if (await garder.isVisible()) await garder.click();
  }
  await alice.waitForTimeout(3500);
  await shot(alice, 'r0-alice-cadrage-depart');
  await shot(bob, 'r0-bob-cadrage-depart');

  // Révéler trois cartes.
  await alice.evaluate(() => {
    const s = window.__mtg.getState();
    s.send({ type: 'LOOK', zone: { seat: s.mySeat, kind: 'LIBRARY' }, count: 3, mode: 'REVEAL' });
  });
  await alice.locator('[data-test="look-modal"]').waitFor({ timeout: 8000 });
  await bob.waitForTimeout(700);
  await shot(alice, 'r1-alice-revele');
  await shot(bob, 'r1-bob-pendant');
  // Alice en prend une en main et valide aussitôt, comme on le fait vraiment.
  await alice.locator('[data-test="look-card"]').first().locator('[data-test="look-quick-hand"]').click();
  await alice.locator('[data-test="look-submit-no-shuffle"]').click();
  await bob.waitForTimeout(400);
  await shot(bob, 'r2-bob-juste-apres');
  await bob.waitForTimeout(4000);
  await shot(bob, "r3b-bob-4s"); await bob.waitForTimeout(5000);
  await shot(bob, 'r3-bob-9s-apres');

  // Survol d'une carte double face en main.
  const dfc = await alice.evaluate(() => {
    const s = window.__mtg.getState();
    const main = [...s.cards.values()].filter((c) => c.zone.kind === 'HAND' && c.zone.seat === s.mySeat);
    return main.map((c) => c.id);
  });
  for (const id of dfc) {
    await alice.locator(`[data-card-id="${id}"]`).first().hover().catch(() => {});
    await alice.waitForTimeout(500);
    if (await alice.locator('[data-test="card-preview-other-face"]').isVisible()) {
      await alice.waitForTimeout(800);
      await shot(alice, 'r4-alice-double-face');
      break;
    }
  }
} catch (e) {
  console.log('ERREUR', String(e).slice(0, 400));
} finally {
  console.log('--- erreurs console ---');
  console.log(errors.length ? [...new Set(errors)].join(NL) : 'aucune');
  await browser.close();
}
