/**
 * Sonde : l'étagère à jetons appartient à un deck, et se copie en un clic.
 *
 * Un vrai compte, trois decks, un vrai navigateur. On vérifie :
 *
 *  - dans « Mes decks », qu'un clic sur une source copie ses jetons dans le
 *    deck visé, sans toucher à la source ;
 *  - à la table, que l'étagère affichée est celle du deck chargé, qu'un seul
 *    bouton ouvre la liste des autres étagères, que la copie est écrite dans
 *    le deck (elle survit au rechargement) et que l'ancienne étagère commune
 *    reste copiable ;
 *  - qu'un changement de deck avant la partie change d'étagère ;
 *  - qu'un invité, sans deck enregistré, a une étagère pour cette table seule.
 *
 *   node scripts/probe-etagere-deck.mjs [url-de-base] [dossier-de-captures]
 */
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const SHOTS = process.argv[3] ?? '.';
const NL = String.fromCharCode(10);
const LIST = ['// Commander', '1 Selenia, the Cursed Heart', '', '// Deck', '4 Sol Ring', '20 Plains'].join(NL);

let failures = 0;
function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'ÉCHEC'} ${label}${detail ? ' — ' + detail : ''}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, locale: 'fr-FR' });
const page = await context.newPage();
const http = context.request;
const json = async (res) => {
  if (!res.ok()) throw new Error(`${res.url()} → ${res.status()} ${await res.text()}`);
  return res.json();
};

try {
  // --- Un compte et trois decks ---------------------------------------------
  const email = `sonde-${Date.now()}@example.org`;
  await json(await http.post(`${BASE}/api/auth/register`, {
    data: { email, password: 'Sonde-etagere-2026!', displayName: `Sonde${Date.now() % 100000}` },
  }));
  // L'inscription n'ouvre pas de session : on se connecte ensuite.
  await json(await http.post(`${BASE}/api/auth/login`, { data: { email, password: 'Sonde-etagere-2026!' } }));
  const deckIds = {};
  for (const name of ['Gobelins', 'Trésors', 'Neuf']) {
    const made = await json(await http.post(`${BASE}/api/decks/import`, { data: { source: 'TEXT', text: LIST, name } }));
    deckIds[name] = made.deckId;
  }
  // Trois jetons réels du catalogue : l'étagère ne retient que des impressions.
  const found = await json(await http.get(`${BASE}/api/cards/search?q=goblin&type=token`)).catch(() => null);
  const pool = (found?.tokens ?? found?.cards ?? found?.results ?? []).slice(0, 3);
  if (pool.length < 3) throw new Error('pas assez de jetons trouvés par la recherche');
  const [g1, g2, old] = pool.map((c) => ({ scryfallId: c.scryfallId, name: c.name }));

  await json(await http.put(`${BASE}/api/decks/${deckIds['Gobelins']}/token-shelf`, { data: { items: [g1, g2] } }));
  // L'ancienne étagère commune, telle qu'un compte d'avant la porte encore.
  await json(await http.patch(`${BASE}/api/me`, { data: { extra: { tokenShelf: [old] } } }));

  const shelfOf = async (name) =>
    (await json(await http.get(`${BASE}/api/decks`))).decks.find((d) => d.name === name).tokenShelf;
  const updatedAt = async (name) =>
    (await json(await http.get(`${BASE}/api/decks`))).decks.find((d) => d.name === name).updatedAt;

  // --- Mes decks --------------------------------------------------------------
  await page.goto(`${BASE}/decks`);
  const row = (name) => page.locator('li', { has: page.getByText(name, { exact: true }) }).first();
  await row('Gobelins').locator('[data-test="deck-token"]').first().waitFor();
  check('« Mes decks » montre les jetons du deck', (await row('Gobelins').locator('[data-test="deck-token"]').count()) === 2);
  check('le deck ne se propose pas lui-même comme source',
    (await row('Gobelins').locator(`[data-test="deck-token-copy"][data-source="${deckIds['Gobelins']}"]`).count()) === 0);

  const before = await updatedAt('Trésors');
  await row('Trésors').locator(`[data-test="deck-token-copy"][data-source="${deckIds['Gobelins']}"]`).click();
  await row('Trésors').locator('[data-test="deck-token"]').nth(1).waitFor();
  check('un clic copie les jetons d’un deck dans un autre', (await shelfOf('Trésors')).length === 2);
  check('la source n’a pas changé', (await shelfOf('Gobelins')).length === 2);
  check('copier des jetons ne fait pas remonter le deck comme « modifié »', (await updatedAt('Trésors')) === before);
  check('une source qui n’apporte plus rien n’est plus proposée',
    (await row('Trésors').locator(`[data-test="deck-token-copy"][data-source="${deckIds['Gobelins']}"]`).count()) === 0);
  await page.screenshot({ path: `${SHOTS}/etagere-1-mes-decks.png` });

  // --- À la table, avec le deck « Neuf » (étagère vide) ----------------------
  await page.goto(`${BASE}/`);
  await page.getByRole('button', { name: /obtenir le lien/i }).click();
  await page.waitForURL(/\/rooms\//);
  const roomUrl = page.url();
  await page.locator('select.paper-select').selectOption(deckIds['Neuf']);
  await page.getByRole('button', { name: /S'asseoir/ }).click();
  const shelf = page.locator('[data-test="token-shelf"]');
  await shelf.locator('[data-test="shelf-scope"]').waitFor({ timeout: 60000 });
  check('l’étagère dit à quel deck elle appartient',
    (await shelf.locator('[data-test="shelf-scope"]').getAttribute('data-scope')) === 'DECK' &&
      (await shelf.locator('[data-test="shelf-scope"]').innerText()).includes('Neuf'));
  check('l’étagère d’un deck neuf est vide', (await shelf.locator('[data-test="shelf-token"]').count()) === 0);
  check('elle ne montre qu’un bouton pour copier, pas de liste', 
    (await shelf.locator('[data-test="shelf-copy"]').count()) === 1 &&
      (await page.locator('[data-test="shelf-copy-source"]').count()) === 0);
  await page.screenshot({ path: `${SHOTS}/etagere-2-table-vide.png` });

  const modal = page.locator('[data-test="shelf-copy-modal"]');
  await shelf.locator('[data-test="shelf-copy"]').click();
  await modal.waitFor();
  check('le bouton ouvre la liste des autres étagères', (await modal.locator('[data-test="shelf-copy-source"]').count()) === 3);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/etagere-3-fenetre-copie.png` });
  await page.keyboard.press('Escape');
  check('Échap referme la fenêtre sans rien copier',
    (await modal.count()) === 0 && (await shelf.locator('[data-test="shelf-token"]').count()) === 0);

  await shelf.locator('[data-test="shelf-copy"]').click();
  await modal.locator(`[data-test="shelf-copy-source"][data-source="${deckIds['Gobelins']}"]`).click();
  await shelf.locator('[data-test="shelf-token"]').nth(1).waitFor();
  check('un clic sur une étagère la copie et referme la fenêtre',
    (await shelf.locator('[data-test="shelf-token"]').count()) === 2 && (await modal.count()) === 0);
  check('la copie est écrite dans le deck', (await shelfOf('Neuf')).length === 2);
  await page.screenshot({ path: `${SHOTS}/etagere-4-table-copiee.png` });

  await page.reload();
  await shelf.locator('[data-test="shelf-token"]').nth(1).waitFor({ timeout: 60000 });
  check('l’étagère du deck survit au rechargement', (await shelf.locator('[data-test="shelf-token"]').count()) === 2);

  // Étagère non vide : la copie passe par son bouton, et l'ancienne étagère y est.
  await shelf.locator('[data-test="shelf-copy"]').click();
  await modal.locator('[data-test="shelf-copy-source"][data-source="legacy"]').click();
  await shelf.locator('[data-test="shelf-token"]').nth(2).waitFor();
  check('l’ancienne étagère commune se copie comme une autre', (await shelfOf('Neuf')).length === 3);
  check('rien n’a été retiré par la copie',
    JSON.stringify((await shelfOf('Neuf')).slice(0, 2).map((t) => t.scryfallId)) === JSON.stringify([g1.scryfallId, g2.scryfallId]));

  // Retirer un jeton de l'étagère : c'est le deck qui est écrit, et lui seul.
  await shelf.locator('[data-test="shelf-token"]').first().hover();
  await shelf.locator('[data-test="shelf-remove"]').first().click();
  await page.waitForTimeout(500);
  check('retirer un jeton l’enlève de ce deck', (await shelfOf('Neuf')).length === 2);
  check('et pas du deck d’où il avait été copié', (await shelfOf('Gobelins')).length === 2);

  // --- Changer de deck avant la partie change d'étagère -----------------------
  await page.locator('[data-test="open-pregame"]').click();
  await page.locator('[data-test="pregame-deck"] select').first().selectOption(deckIds['Gobelins']);
  await page.locator('[data-test="pregame-deck"] select').first().locator('xpath=following::button[1]').click();
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-test="shelf-scope"]');
    return Boolean(el) && el.textContent.includes('Gobelins');
  }, null, { timeout: 20000 });
  check('charger un autre deck montre son étagère', (await shelf.locator('[data-test="shelf-token"]').count()) === 2);

  // --- Un invité : pas de deck enregistré, une étagère pour cette table -------
  const guest = await (await browser.newContext({ viewport: { width: 1600, height: 900 }, locale: 'fr-FR' })).newPage();
  await guest.goto(roomUrl);
  await guest.getByPlaceholder('Invité').fill('Invité');
  await guest.locator('textarea').first().fill(LIST);
  await guest.getByRole('button', { name: /S'asseoir/ }).click();
  const guestScope = guest.locator('[data-test="token-shelf"] [data-test="shelf-scope"]');
  await guestScope.waitFor({ timeout: 60000 });
  check('un invité a l’étagère de cette table', (await guestScope.getAttribute('data-scope')) === 'TABLE');
  check('et aucune étagère d’autrui à copier', (await guest.locator('[data-test="shelf-copy"]').count()) === 0);
  await guest.screenshot({ path: `${SHOTS}/etagere-5-invite.png` });
} catch (err) {
  failures += 1;
  console.log('ÉCHEC — la sonde s’est arrêtée :', err.message.split(NL).slice(0, 3).join(' | '));
  await page.screenshot({ path: `${SHOTS}/etagere-erreur.png` }).catch(() => {});
} finally {
  await browser.close();
}
console.log(failures === 0 ? 'Tout est conforme.' : `${failures} point(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
