/**
 * Sonde : attaquer, bloquer, cibler, vus des deux côtés.
 *
 *   node scripts/probe-fleches.mjs <dossier> [url-de-base]
 */
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? '.';
const BASE = process.argv[3] ?? 'http://localhost:3191';
const NL = String.fromCharCode(10);
const DECK_A = ['// Commander', '1 Selenia, the Cursed Heart', '// Deck', '49 Serra Angel'].join(NL);
const DECK_B = ['// Commander', '1 Omnath, Locus of Mana', '// Deck', '49 Craw Wurm'].join(NL);

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
const shot = async (page, nom) => { await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${nom}.png` }); console.log('capture', nom); };
const check = (ok, txt) => console.log((ok ? 'OK    - ' : 'ÉCHEC - ') + txt);
/** Pose la première carte de la main, et attend qu'elle soit arrivée : sans
 *  cela, deux poses de suite reprenaient la même carte. */
const poser = async (page, x, y) => {
  const id = await page.evaluate(([px, py]) => {
    const s = window.__mtg.getState();
    const c = [...s.cards.values()].find((k) => k.zone.kind === 'HAND' && k.zone.seat === s.mySeat);
    s.send({ type: 'MOVE_CARD', cardId: c.id, to: { seat: s.mySeat, kind: 'BATTLEFIELD' }, x: px, y: py });
    return c.id;
  }, [x, y]);
  await page.waitForFunction((cid) => window.__mtg.getState().cards.get(cid)?.zone.kind === 'BATTLEFIELD', id, { timeout: 8000 });
  return id;
};
const menu = async (page, id, nom) => {
  await page.locator(`[data-card-id="${id}"]`).first().click({ button: 'right' });
  await page.getByRole('button', { name: nom }).first().click();
};

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
    await p.waitForTimeout(500);
    await p.keyboard.press('Escape');
    const garder = p.locator('[data-test="opening-keep"]');
    if (await garder.isVisible()) await garder.click();
  }
  const ange = await poser(alice, 400, 150);
  const ange2 = await poser(alice, 700, 150);
  const wurm = await poser(bob, 400, 150);
  await alice.waitForTimeout(5000); // que les indices s'éteignent

  // Alice attaque avec un ange (menu) — à deux, la flèche part tout de suite.
  await menu(alice, ange, /^Attaquer/);
  await bob.waitForTimeout(500);
  check(await bob.locator('[data-test="arrow-ATTACK"]').count() === 1, 'Bob voit la flèche d’attaque');
  check(!(await alice.evaluate((id) => window.__mtg.getState().cards.get(id).tapped, ange)), 'Ange de Serra a la vigilance : elle ne s’engage pas en attaquant');
  // Le second ange attaque au clavier.
  await alice.locator(`[data-card-id="${ange2}"]`).first().hover();
  await alice.keyboard.press('a');
  await bob.waitForTimeout(500);
  check(await bob.locator('[data-test="arrow-ATTACK"]').count() === 2, 'la touche A trace une seconde attaque');
  await shot(bob, 'f1-bob-voit-attaque');

  // Bob bloque le premier ange avec son Wurm.
  await menu(bob, wurm, /^Bloquer/);
  check(await bob.locator('[data-test="arrow-pick-banner"]').isVisible(), 'Bob passe en visée');
  await bob.mouse.move(700, 450);
  await shot(bob, 'f2-bob-vise');
  await bob.locator(`[data-card-id="${ange}"]`).first().click();
  await alice.waitForTimeout(500);
  check(await alice.locator('[data-test="arrow-BLOCK"]').count() === 1, 'Alice voit le blocage');
  await shot(alice, 'f3-alice-voit-blocage');

  // Échap annule une visée.
  await menu(alice, ange2, /^Cibler/);
  await alice.keyboard.press('Escape');
  check(!(await alice.locator('[data-test="arrow-pick-banner"]').isVisible()), 'Échap annule la visée');

  // Fin du tour : tout s'efface.
  await alice.evaluate(() => {
    const s = window.__mtg.getState();
    if (s.turn.activeSeat === s.mySeat) s.send({ type: 'END_TURN' });
  });
  await bob.evaluate(() => {
    const s = window.__mtg.getState();
    if (s.turn.activeSeat === s.mySeat) s.send({ type: 'END_TURN' });
  });
  await alice.waitForTimeout(600);
  check(await alice.locator('[data-test^="arrow-"]').count() === 0, 'les flèches s’effacent au passage du tour');
  const log = await alice.evaluate(() => window.__mtg.getState().log.slice(-8).map((l) => l.text).join(' | '));
  console.log('journal :', log);
} catch (e) {
  console.log('ERREUR', String(e).slice(0, 400));
} finally {
  console.log('--- erreurs console ---');
  console.log(errors.length ? [...new Set(errors)].join(NL) : 'aucune');
  await browser.close();
}
