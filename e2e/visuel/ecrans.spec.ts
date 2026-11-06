import { expect, test, type Page } from '@playwright/test';
import * as data from './fixtures';

// Photographie chaque écran avec une API simulée : CAPTURES=dossier npx playwright test e2e/visuel
const OUT = process.env.CAPTURES;
const L = `/leagues/${data.LEAGUE_ID}`;

async function mockApi(page: Page, routes: [RegExp, unknown][]) {
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url()).pathname;
    const hit = routes.find(([pattern]) => pattern.test(url));
    return route.fulfill({ status: hit ? 200 : 404, contentType: 'application/json', body: JSON.stringify(hit ? hit[1] : { error: 'simulé' }) });
  });
  await page.addInitScript(user => {
    localStorage.setItem('token', 'jeton-simule');
    localStorage.setItem('user', JSON.stringify(user));
  }, data.USER);
}

const base: [RegExp, unknown][] = [
  [/^\/api\/leagues$/, data.LEAGUES],
  [/^\/api\/matches/, data.MATCHES],
  [/^\/api\/players/, data.PLAYERS],
  [/\/my-team$/, data.TEAM],
  [/\/standings$/, data.STANDINGS],
  [/\/lineup$/, data.LINEUP],
];

const SCREENS: { name: string; path: string; routes: [RegExp, unknown][] }[] = [
  { name: 'accueil', path: '/home', routes: [[/\/week$/, data.WEEK('pression', 2.3, [0, 0])], ...base] },
  { name: 'ligues', path: '/leagues', routes: base },
  { name: 'joueurs', path: '/players', routes: base },
  { name: 'regles', path: '/rules', routes: base },
  { name: 'ligue-pression', path: L, routes: [[/\/week$/, data.WEEK('pression', 2.3, [0, 0])], [/\/api\/leagues\/[^/]+$/, data.LEAGUE('completed')], [/\/lottery\//, data.LOTTERY('scheduled')], ...base] },
  { name: 'ligue-soiree', path: L, routes: [[/\/week$/, data.WEEK('soiree', -1, [62.4, 57.1])], [/\/api\/leagues\/[^/]+$/, data.LEAGUE('completed')], [/\/lottery\//, data.LOTTERY('scheduled')], ...base] },
  { name: 'ligue-avant-draft', path: L, routes: [[/\/week$/, data.WEEK('calme', 70, [0, 0])], [/\/api\/leagues\/[^/]+$/, data.LEAGUE('pending')], [/\/lottery\//, data.LOTTERY('scheduled')], ...base] },
  { name: 'equipe', path: `${L}/team`, routes: [[/\/week$/, data.WEEK('calme', 70, [80, 72])], ...base] },
  { name: 'composition', path: `${L}/lineup`, routes: base },
  { name: 'draft', path: `${L}/draft`, routes: [[/\/auction-state$/, data.AUCTION], [/\/api\/leagues\/[^/]+$/, data.LEAGUE('in_progress')], ...base] },
  { name: 'loterie-avant', path: `${L}/lottery`, routes: [[/\/state$/, data.LOTTERY('scheduled')], ...base] },
  { name: 'loterie-direct', path: `${L}/lottery`, routes: [[/\/state$/, data.LOTTERY('live')], ...base] },
  { name: 'loterie-pack', path: `${L}/lottery`, routes: [[/\/state$/, data.LOTTERY_PACK()], ...base] },
];

for (const screen of SCREENS) {
  test(`écran ${screen.name}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));

    await mockApi(page, screen.routes);
    await page.goto(screen.path);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(700);

    if (OUT) await page.screenshot({ path: `${OUT}/${info.project.name}-${screen.name}.png`, fullPage: true });

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'défilement horizontal').toBe(0);
    expect(errors).toEqual([]);
  });
}
