/**
 * Sonde : le panneau « Réglages du plateau » tient-il dans une fenêtre basse ?
 *
 *   node scripts/probe-reglages.mjs [url-de-base]
 *
 * **Pourquoi une sonde et non une étape de la recette.** La mesure exige de
 * redimensionner la fenêtre, et `verify-ui.mjs` partage **un seul monde** entre
 * ses cent-et-quelques étapes : redimensionner recadre la caméra, et deux
 * étapes plus loin une étiquette tombait à 781 px du point cliqué — un échec
 * qui accusait le menu du fond, parfaitement sain. La seule autre étape de la
 * recette qui redimensionne est, pour cette raison, la **dernière**.
 *
 * Ce qui est gardé n'est pas une hauteur de panneau mais ce qui doit rester
 * vrai quelle que soit sa hauteur : **le sommet reste visible, et le bas reste
 * atteignable**. Le panneau est fait pour grandir — il a déjà accueilli la
 * disposition des terrains, puis ses deux curseurs d'écartement.
 *
 * Le défaut mesuré avant correction : 981 px de haut, fixes. À 800 px de
 * fenêtre le sommet tombait à −90, le champ de playmat était coupé hors de
 * l'écran, et le bouton « Fermer » devenait inatteignable. Le voile *pouvait*
 * défiler, mais `items-center` l'en empêchait : le centrage flex rogne par le
 * **haut** dès que l'enfant dépasse, là où un défilement normal rogne par le
 * bas.
 */
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const NL = String.fromCharCode(10);
const DECK = ['// Commander', '1 Selenia, the Cursed Heart', '// Deck', '4 Sol Ring', '20 Plains'].join(NL);

/** Les hauteurs éprouvées : un portable ordinaire, puis deux cas serrés. */
const HAUTEURS = [1000, 800, 620, 500];

let failures = 0;
const check = (ok, text) => {
  console.log((ok ? 'OK    - ' : 'ÉCHEC - ') + text);
  if (!ok) failures += 1;
};

const browser = await chromium.launch({ headless: true });

for (const hauteur of HAUTEURS) {
  // Un contexte par hauteur : c'est ce qui rend la sonde indépendante de
  // l'ordre, et de tout ce qu'une mesure précédente aurait pu laisser derrière.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: hauteur } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  await page.getByRole('button', { name: /obtenir le lien/i }).click();
  await page.waitForURL(/\/rooms\//);
  await page.getByPlaceholder('Invité').fill('Alice');
  await page.locator('textarea').first().fill(DECK);
  await page.getByRole('button', { name: /S'asseoir/ }).click();
  await page.waitForFunction(() => Boolean(window.__mtg?.getState().mySeat), null, { timeout: 20000 });

  await page.locator('button[title="Réglages du plateau"]').click();
  const panneau = page.locator('[data-test="seat-settings"]');
  await panneau.waitFor({ timeout: 5000 });
  await page.waitForTimeout(350);

  const mesure = await page.evaluate(() => {
    const p = document.querySelector('[data-test="seat-settings"]');
    const r = p.getBoundingClientRect();
    return {
      haut: Math.round(r.top),
      bas: Math.round(r.bottom),
      hauteur: Math.round(r.height),
      fenetre: window.innerHeight,
      defile: p.scrollHeight > p.clientHeight + 1,
    };
  });

  check(mesure.haut >= 0, `fenêtre ${hauteur} : le sommet du panneau reste à l'écran (${mesure.haut})`);
  check(
    mesure.bas <= mesure.fenetre,
    `fenêtre ${hauteur} : le bas du panneau reste à l'écran (${mesure.bas} pour ${mesure.fenetre})`,
  );

  // Le bas doit être **atteignable**, pas seulement exister : on défile à
  // l'intérieur du panneau, puis on regarde où tombe son dernier bouton.
  await page.evaluate(() => {
    const p = document.querySelector('[data-test="seat-settings"]');
    p.scrollTop = p.scrollHeight;
  });
  await page.waitForTimeout(250);
  const fermer = await page.evaluate(() => {
    const p = document.querySelector('[data-test="seat-settings"]');
    const b = [...p.querySelectorAll('button')].filter((x) => x.textContent.trim() === 'Fermer').pop();
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight;
  });
  check(fermer !== null, `fenêtre ${hauteur} : le bouton « Fermer » existe`);
  check(fermer === true, `fenêtre ${hauteur} : « Fermer » est atteignable`);

  console.log(
    `      panneau ${mesure.hauteur} px, ${mesure.haut}..${mesure.bas} — défile à l'intérieur : ${mesure.defile}`,
  );

  // Et les deux curseurs d'écartement disent bien ce qu'ils appliquent : aux
  // formes en piles, l'espacement ne descend pas sous zéro, parce que deux
  // piles qui se recouvrent sont illisibles (`pileGap`).
  for (const [forme, plancher] of [['rows', -0.6], ['piles-by-type', 0]]) {
    await page.locator(`[data-test="land-shape-${forme}"]`).click();
    await page.waitForTimeout(300);
    const curseurs = await page.evaluate(() => {
      const p = document.querySelector('[data-test="seat-settings"]');
      const esp = p.querySelector('[data-test="land-spacing"]');
      const diag = p.querySelector('[data-test="land-diagonal"]');
      return { min: Number(esp.min), valeur: Number(esp.value), diagonale: Boolean(diag) };
    });
    check(
      curseurs.min === plancher,
      `fenêtre ${hauteur} · ${forme} : l'espacement part de ${plancher} (vu ${curseurs.min})`,
    );
    check(
      curseurs.valeur >= curseurs.min,
      `fenêtre ${hauteur} · ${forme} : la valeur montrée est celle qui s'applique (${curseurs.valeur})`,
    );
    check(
      curseurs.diagonale === (forme !== 'rows'),
      `fenêtre ${hauteur} · ${forme} : la diagonale ne se montre que pour les piles`,
    );
  }

  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? 'TOUT PASSE' : `${failures} ÉCHEC(S)`);
process.exit(failures === 0 ? 0 : 1);
