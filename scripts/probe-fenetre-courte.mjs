/**
 * Sonde : la table sur une fenêtre courte — un portable, pas un écran de bureau.
 *
 * Un écran de 1366 × 768 laisse environ 650 px de haut au navigateur, un écran
 * de 1280 × 720 en laisse 620. C'est là que les éléments flottants, tous posés
 * en position fixe, se marchaient dessus : le journal sous les boutons de
 * cadrage, l'étagère à jetons sous la réserve de mana, la dernière carte de la
 * main sous cette même réserve, et la fin du menu Actions hors de l'écran,
 * « Concéder » compris. Rien de tout cela ne se voit à 1600 × 900, la taille
 * des autres sondes.
 *
 * On joue une vraie partie de Treachery à quatre, et l'on vérifie à chaque
 * taille que tout ce qui se clique reste atteignable.
 *
 *   node scripts/probe-fenetre-courte.mjs [url-de-base] [dossier-de-captures]
 */
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const SHOTS = process.argv[3] ?? '.';
const NL = String.fromCharCode(10);
const DECK = ['// Commander', '1 Selenia, the Cursed Heart', '', '// Deck', '4 Sol Ring', '30 Plains'].join(NL);
const NAMES = ['Alice', 'Bob', 'Carol', 'Dan'];
const SIZES = [
  { width: 1280, height: 620 },
  { width: 1366, height: 650 },
  { width: 1536, height: 730 },
];

let failures = 0;
function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'ÉCHEC'} ${label}${detail ? ' — ' + detail : ''}`);
}

const browser = await chromium.launch({ headless: true });

async function seat(name, url) {
  const context = await browser.newContext({ viewport: SIZES[0] });
  const page = await context.newPage();
  await page.goto(url ?? BASE + '/');
  if (!url) {
    await page.getByRole('radio', { name: 'Treachery' }).click();
    await page.getByRole('button', { name: /obtenir le lien/i }).click();
    await page.waitForURL(/\/rooms\//);
  }
  await page.getByPlaceholder('Invité').fill(name);
  await page.locator('textarea').first().fill(DECK);
  await page.getByRole('button', { name: /S'asseoir/ }).click();
  await page.waitForFunction(
    () => {
      const s = window.__mtg?.getState();
      return Boolean(s?.mySeat) && (s.zoneCounts.get(s.mySeat + '|LIBRARY') ?? 0) > 0;
    },
    null,
    { timeout: 60000 },
  );
  return page;
}

/** Les boîtes des éléments flottants, telles que le navigateur les a posées. */
const boxes = (page) =>
  page.evaluate(() => {
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    const s = window.__mtg.getState();
    const columns = [...document.querySelectorAll('.hud-column')];
    return {
      height: window.innerHeight,
      left: rect(columns[0]),
      right: rect(columns[1]),
      framing: rect(document.querySelector('[data-test="recenter"]')?.parentElement),
      mana: rect(document.querySelector('[data-test="mana-pool"]')),
      hand: rect(document.querySelector('[data-test="hand-rail"]')),
      mine: rect(document.querySelector(`[data-zone="${s.mySeat}|BATTLEFIELD"]`)),
      library: rect(document.querySelector(`[data-zone="${s.mySeat}|LIBRARY"]`)),
    };
  });

const overlap = (a, b) =>
  Boolean(a && b) && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;

/** L'élément est-il visible et réellement sous le pointeur en son centre ? */
const reachable = (locator) =>
  locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight || r.left < 0 || r.right > window.innerWidth) return false;
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return Boolean(top) && (el.contains(top) || top.contains(el));
  });

const pages = [];
try {
  pages.push(await seat(NAMES[0]));
  const url = pages[0].url();
  for (let i = 1; i < NAMES.length; i++) pages.push(await seat(NAMES[i], url));
  const host = pages[0];
  await host.waitForFunction((n) => window.__mtg.getState().seats.length === n, NAMES.length);
  await host.locator('[data-test="start-game"]').click();
  await host.waitForFunction(() => {
    const s = window.__mtg.getState();
    return s.room?.status === 'PLAYING' && s.treachery?.identities.has(s.mySeat);
  });
  // Une grosse main : c'est elle qui allait sous la réserve de mana.
  await host.evaluate(() => window.__mtg.getState().send({ type: 'DRAW', count: 6 }));
  await host.waitForFunction(
    () => (window.__mtg.getState().zoneCounts.get(window.__mtg.getState().mySeat + '|HAND') ?? 0) >= 13,
  );

  for (const size of SIZES) {
    const at = `${size.width}×${size.height}`;
    await host.setViewportSize(size);
    await host.waitForTimeout(400);
    await host.locator('[data-test="recenter-me"]').click();
    await host.waitForTimeout(400);
    const b = await boxes(host);

    check(`${at} · la colonne de gauche s'arrête au-dessus des boutons de cadrage`, b.left.bottom <= b.framing.top + 1, `${Math.round(b.left.bottom)} / ${Math.round(b.framing.top)}`);
    check(`${at} · la colonne de droite s'arrête au-dessus de la réserve de mana`, b.right.bottom <= b.mana.top + 1, `${Math.round(b.right.bottom)} / ${Math.round(b.mana.top)}`);
    check(`${at} · la main ne passe ni sous la réserve de mana ni sous les boutons de cadrage`, !overlap(b.hand, b.mana) && !overlap(b.hand, b.framing));
    check(`${at} · « recentrer sur moi » : mon terrain et ma bibliothèque restent hors des colonnes`,
      b.mine.left >= b.left.right - 1 && b.mine.right <= b.right.left + 1 && b.library.right <= b.right.left + 1,
      `terrain ${Math.round(b.mine.left)}–${Math.round(b.mine.right)}, bibliothèque → ${Math.round(b.library.right)}, colonnes ${Math.round(b.left.right)} / ${Math.round(b.right.left)}`);

    // Le journal : il doit se lire en entier, quitte à faire défiler la colonne
    // — à la molette, sans barre visible.
    await host.mouse.move(150, 300);
    await host.mouse.wheel(0, 2000);
    await host.waitForTimeout(250);
    const journal = await host.evaluate(() => {
      const column = document.querySelector('.hud-column').getBoundingClientRect();
      const log = document.querySelector('.hud-column > .hud-shrink').getBoundingClientRect();
      return { bottom: log.bottom, height: log.height, limit: column.bottom };
    });
    check(`${at} · le journal se lit en entier (au besoin en faisant défiler la colonne)`,
      journal.bottom <= journal.limit + 1 && journal.height >= 140,
      `bas ${Math.round(journal.bottom)} / ${Math.round(journal.limit)}, haut de ${Math.round(journal.height)} px`);
    await host.mouse.wheel(0, -2000);

    // Le menu Actions : sa dernière entrée, et Échap pour le refermer.
    await host.getByRole('button', { name: /^Actions/ }).click();
    const concede = host.getByRole('button', { name: 'Concéder', exact: true });
    await concede.scrollIntoViewIfNeeded();
    check(`${at} · « Concéder » s'atteint dans le menu Actions`, await reachable(concede));
    if (size === SIZES[0]) await host.screenshot({ path: `${SHOTS}/fenetre-courte-menu-actions.png` });
    await host.keyboard.press('Escape');
    check(`${at} · Échap referme le menu Actions`, (await concede.count()) === 0);

    // La carte d'identité : le bouton de fermeture sans défiler, et Échap.
    await host.locator('[data-test="see-my-identity"]').click();
    const close = host.locator('[data-test="identity-card-close"]');
    await close.waitFor();
    await host.waitForTimeout(600);
    check(`${at} · la carte d'identité montre son bouton de fermeture`, await reachable(close));
    if (size === SIZES[0]) await host.screenshot({ path: `${SHOTS}/fenetre-courte-carte.png` });
    await host.keyboard.press('Escape');
    check(`${at} · Échap referme la carte d'identité`, (await host.locator('[data-test="identity-card-modal"]').count()) === 0);
    await host.screenshot({ path: `${SHOTS}/fenetre-courte-${size.width}.png` });
  }
} catch (err) {
  failures += 1;
  console.log('ÉCHEC — la sonde s’est arrêtée :', err.message.split(NL)[0]);
  if (pages[0]) await pages[0].screenshot({ path: `${SHOTS}/fenetre-courte-erreur.png` }).catch(() => {});
} finally {
  await browser.close();
}
console.log(failures === 0 ? 'Tout est conforme.' : `${failures} point(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
