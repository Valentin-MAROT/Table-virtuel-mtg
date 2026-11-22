/**
 * Sonde : une partie Treachery jouée de bout en bout, dans de vrais navigateurs.
 *
 * Ce que les tests du serveur ne peuvent pas dire — ce que chaque joueur
 * **voit**. On assoit N joueurs, on lance, et l'on vérifie sur l'écran et sur
 * le fil réel :
 *
 *  - que chacun voit son identité et celle du Leader, et aucune autre ;
 *  - qu'aucune trame WebSocket reçue par un joueur ne porte l'identité secrète
 *    d'un autre (le trafic, pas l'état de l'application) ;
 *  - qu'un dévoilement se voit chez tout le monde ;
 *  - que la partie se termine sur l'annonce de l'équipe gagnante.
 *
 *   node scripts/probe-treachery.mjs [url-de-base] [nombre-de-joueurs] [dossier-de-captures]
 */
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const COUNT = Number(process.argv[3] ?? 5);
const SHOTS = process.argv[4] ?? '.';
const NL = String.fromCharCode(10);
const DECK = ['// Commander', '1 Selenia, the Cursed Heart', '', '// Deck', '4 Sol Ring', '20 Plains'].join(NL);
const NAMES = ['Alice', 'Bob', 'Carol', 'Dan', 'Erin', 'Frank', 'Grace', 'Heidi'];

let failures = 0;
function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'ÉCHEC'} ${label}${detail ? ' — ' + detail : ''}`);
}

const browser = await chromium.launch({ headless: true });
const players = [];

async function seat(name, url) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();
  const frames = [];
  page.on('websocket', (ws) =>
    ws.on('framereceived', (f) => typeof f.payload === 'string' && frames.push(f.payload)),
  );
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
  return { name, page, frames };
}

const state = (page) =>
  page.evaluate(() => {
    const s = window.__mtg.getState();
    return {
      mySeat: s.mySeat,
      status: s.room?.status,
      activeSeat: s.turn.activeSeat,
      seats: s.seats.length,
      gameOver: s.gameOver,
      identities: s.treachery ? [...s.treachery.identities.values()] : null,
    };
  });

try {
  players.push(await seat(NAMES[0]));
  const url = players[0].page.url();
  for (let i = 1; i < COUNT; i++) players.push(await seat(NAMES[i], url));
  const host = players[0].page;

  await host.waitForFunction((n) => window.__mtg.getState().seats.length === n, COUNT);
  check(`${COUNT} joueurs assis`, (await state(host)).seats === COUNT);
  await host.screenshot({ path: `${SHOTS}/treachery-${COUNT}-1-salon.png` });

  await host.locator('[data-test="start-game"]').click();
  for (const p of players) {
    await p.page.waitForFunction(() => {
      const s = window.__mtg.getState();
      return s.room?.status === 'PLAYING' && s.treachery?.identities.has(s.mySeat);
    });
  }

  const views = [];
  for (const p of players) views.push({ ...p, ...(await state(p.page)) });
  const leader = views[0].identities.find((i) => i.role === 'LEADER')?.seat;
  check('le Leader est connu et commence', Boolean(leader) && views[0].activeSeat === leader);

  // Ce que chacun sait : sa carte et le Leader, rien d'autre.
  for (const v of views) {
    const seen = v.identities.map((i) => i.seat).sort();
    const allowed = [...new Set([v.mySeat, leader])].sort();
    check(`${v.name} ne connaît que sa carte et le Leader`, JSON.stringify(seen) === JSON.stringify(allowed), seen.join(','));
  }

  // Le fil réel : la carte secrète d'un joueur n'apparaît chez aucun autre.
  const secrets = views.map((v) => v.identities.find((i) => i.seat === v.mySeat)).filter((i) => !i.unveiled);
  for (const v of views) {
    const leaked = secrets.filter((s) => {
      if (s.seat === v.mySeat) return false;
      return v.frames.some((f) => f.includes(`"seat":"${s.seat}","displayName"`));
    });
    check(`aucune identité secrète dans les trames de ${v.name}`, leaked.length === 0, leaked.map((s) => s.seat).join(','));
  }

  await host.screenshot({ path: `${SHOTS}/treachery-${COUNT}-2-partie.png` });
  // La table entière : c'est là que se juge la disposition à plus de quatre.
  await host.getByRole('button', { name: 'Voir toute la table' }).click();
  await host.waitForTimeout(600);
  const panels = await host.locator('[data-test="playmat-default"]').count();
  check(`les ${COUNT} panneaux sont posés sur la table`, panels === COUNT, String(panels));
  await host.screenshot({ path: `${SHOTS}/treachery-${COUNT}-2b-table.png` });
  await host.locator('[data-test="see-my-identity"]').click();
  await host.locator('[data-test="identity-card-modal"]').waitFor();
  const box = await host.locator('[data-test="identity-card-modal"] [role="dialog"]').boundingBox();
  check('la carte d’identité s’ouvre en grand, au centre', box !== null && box.width > 300 && box.x > 300, JSON.stringify(box));
  // L'image officielle, chargée depuis le site d'origine par ce navigateur.
  const image = host.locator('[data-test="identity-card-image"]');
  const loaded = await image
    .evaluate((img) => img.decode().then(() => img.naturalWidth > 0, () => false), null, { timeout: 15000 })
    .catch(() => false);
  check('l’image de la carte se charge depuis le site d’origine', loaded, await image.getAttribute('src').catch(() => ''));
  await host.screenshot({ path: `${SHOTS}/treachery-${COUNT}-3-carte.png` });
  await host.locator('[data-test="identity-card-close"]').click();

  // Un dévoilement : un joueur secret retourne sa carte, tout le monde la voit.
  const secret = views.find((v) => v.mySeat !== leader);
  await secret.page.locator('[data-test="unveil"]').click();
  await secret.page.getByRole('button', { name: 'Dévoiler' }).last().click();
  for (const p of players) {
    await p.page.waitForFunction(
      (seat) => window.__mtg.getState().treachery?.identities.get(seat)?.unveiled === true,
      secret.mySeat,
    );
  }
  check(`le dévoilement de ${secret.name} est vu de toute la table`, true);
  await host.screenshot({ path: `${SHOTS}/treachery-${COUNT}-4-devoile.png` });

  // Le Leader concède : la partie est décidée, et tout est retourné.
  const leaderView = views.find((v) => v.mySeat === leader);
  await leaderView.page.evaluate(() => window.__mtg.getState().send({ type: 'CONCEDE' }));
  for (const p of players) {
    await p.page.waitForFunction(() => window.__mtg.getState().gameOver !== null);
  }
  const end = await state(host);
  check('la partie est finie, une équipe gagne', end.status === 'ENDED' && Boolean(end.gameOver.team), JSON.stringify(end.gameOver));
  check('toutes les identités sont retournées', end.identities.length === COUNT && end.identities.every((i) => i.unveiled));
  await host.locator('[data-test="treachery-recap"]').waitFor();
  console.log('annonce :', await host.locator('[data-test="game-over-detail"]').innerText());
  await host.screenshot({ path: `${SHOTS}/treachery-${COUNT}-5-fin.png` });
} catch (err) {
  failures += 1;
  console.log('ÉCHEC — la sonde s’est arrêtée :', err.message.split(NL)[0]);
  if (players[0]) await players[0].page.screenshot({ path: `${SHOTS}/treachery-${COUNT}-erreur.png` }).catch(() => {});
} finally {
  await browser.close();
}
console.log(failures === 0 ? 'Tout est conforme.' : `${failures} point(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
