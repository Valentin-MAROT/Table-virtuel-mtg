/**
 * Sonde : les gestes d'un adversaire se voient-ils ?
 *
 *   node scripts/probe-actions.mjs <dossier> [url-de-base]
 *
 * Bob joue une créature et un terrain, engage le terrain, pose un marqueur ;
 * on capture ce qu'Alice voit juste après, puis quand tout s'est éteint.
 */
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? '.';
const BASE = process.argv[3] ?? 'http://localhost:3191';
const NL = String.fromCharCode(10);
const DECK_A = ['// Commander', '1 Selenia, the Cursed Heart', '// Deck', '25 Plains', '24 Swamp'].join(NL);
const DECK_B = ['// Commander', '1 Omnath, Locus of Mana', '// Deck', '20 Forest', '15 Craw Wurm', '14 Llanowar Elves'].join(NL);

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
const check = (ok, txt) => console.log((ok ? 'OK    - ' : 'ÉCHEC - ') + txt);

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
  await alice.waitForTimeout(3500);

  // Bob joue : une créature, un terrain qu'il engage, un marqueur sur la créature.
  await bob.evaluate(async () => {
    const s = window.__mtg.getState();
    const seat = s.mySeat;
    const main = [...s.cards.values()].filter((c) => c.zone.kind === 'HAND' && c.zone.seat === seat);
    const [a, b] = main;
    s.send({ type: 'MOVE_CARD', cardId: a.id, to: { seat, kind: 'BATTLEFIELD' }, x: 300, y: 120 });
    s.send({ type: 'MOVE_CARD', cardId: b.id, to: { seat, kind: 'BATTLEFIELD' }, x: 500, y: 420 });
    await new Promise((r) => setTimeout(r, 300));
    s.send({ type: 'TAP', cardIds: [b.id] });
    s.send({ type: 'ADD_COUNTER', targetId: a.id, kind: 'P1P1', delta: 1 });
  });
  await alice.waitForTimeout(700);
  await shot(alice, 'a1-alice-bob-vient-de-jouer');
  check(await alice.locator('[data-test="played-card"]').count() >= 1, 'Alice voit la carte jouée en grand');
  check(await alice.locator('[data-test="cue-halo"]').count() >= 1, 'Alice voit un halo sur le plateau de Bob');
  check(await alice.locator('[data-test="log-thumbs"]').count() >= 1, 'le journal montre des vignettes');
  check(await bob.locator('[data-test="played-card"]').count() === 0, 'Bob ne voit pas ses propres gestes en grand');
  await alice.waitForTimeout(5000);
  await shot(alice, 'a2-alice-5s-apres');
  check(await alice.locator('[data-test="played-card"]').count() === 0, 'la carte jouée s’est retirée');
  check(await alice.locator('[data-test="cue-halo"]').count() === 0, 'le halo s’est éteint');
} catch (e) {
  console.log('ERREUR', String(e).slice(0, 400));
} finally {
  console.log('--- erreurs console ---');
  console.log(errors.length ? [...new Set(errors)].join(NL) : 'aucune');
  await browser.close();
}
