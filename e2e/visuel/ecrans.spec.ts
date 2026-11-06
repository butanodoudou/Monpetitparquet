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

const shot = async (page: Page, project: string, name: string) => {
  if (OUT) await page.screenshot({ path: `${OUT}/${project}-${name}.png`, fullPage: true });
};
const noOverflow = async (page: Page) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'défilement horizontal').toBe(0);
};

const base: [RegExp, unknown][] = [
  [/^\/api\/leagues$/, data.LEAGUES],
  [/^\/api\/matches/, data.MATCHES],
  [/^\/api\/players/, data.PLAYERS],
  [/^\/api\/collection$/, data.COLLECTION],
  [/\/standings$/, data.STANDINGS],
  [/\/lineup$/, data.LINEUP()],
];

const SCREENS: { name: string; path: string; routes: [RegExp, unknown][] }[] = [
  { name: 'accueil', path: '/home', routes: [[/\/week$/, data.WEEK('pression', 2.3, [0, 0])], ...base] },
  { name: 'accueil-sans-paquet', path: '/home', routes: [[/^\/api\/collection$/, { ...data.COLLECTION, packs: [] }], [/\/week$/, data.WEEK('calme', 70, [0, 0])], ...base] },
  { name: 'ligues', path: '/leagues', routes: base },
  { name: 'joueurs', path: '/players', routes: base },
  { name: 'regles', path: '/rules', routes: base },
  { name: 'ligue-pression', path: L, routes: [[/\/week$/, data.WEEK('pression', 2.3, [0, 0])], [/\/api\/leagues\/[^/]+$/, data.LEAGUE('completed')], [/\/lottery\//, data.LOTTERY('scheduled')], ...base] },
  { name: 'ligue-soiree', path: L, routes: [[/\/week$/, data.WEEK('soiree', -1, [62.4, 57.1])], [/\/api\/leagues\/[^/]+$/, data.LEAGUE('completed')], [/\/lottery\//, data.LOTTERY('scheduled')], ...base] },
  { name: 'ligue-avant-lancement', path: L, routes: [[/\/api\/leagues\/[^/]+$/, data.LEAGUE('pending')], ...base] },
  { name: 'equipe', path: `${L}/team`, routes: [[/\/week$/, data.WEEK('calme', 70, [80, 72])], ...base] },
  { name: 'composition', path: `${L}/lineup`, routes: base },
  { name: 'composition-verrouillee', path: `${L}/lineup`, routes: [[/\/lineup$/, data.LINEUP(true)], ...base] },
  { name: 'composition-vide', path: `${L}/lineup`, routes: [[/\/lineup$/, data.LINEUP_EMPTY], ...base] },
  { name: 'cartes', path: '/collection', routes: base },
  { name: 'cartes-vide', path: '/collection', routes: [[/^\/api\/collection$/, data.COLLECTION_EMPTY], ...base] },
  { name: 'paquet-ferme', path: '/packs', routes: base },
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

    await shot(page, info.project.name, screen.name);
    await noOverflow(page);
    expect(errors).toEqual([]);
  });
}

test('l’équipe renvoie vers le cinq', async ({ page }) => {
  await mockApi(page, base);
  await page.goto(`${L}/team`);
  await expect(page).toHaveURL(new RegExp(`${L}/lineup$`));
});

test('ouverture d’un paquet : tri du moins rare au plus rare, puis suivant, puis entrée dans le jeu', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));

  // Le serveur se souvient des paquets ouverts : un rechargement ne les rend pas
  let open = 0;
  const packs = [data.PACKS[0], data.PACKS[1]];
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url()).pathname;
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (/\/api\/packs\/[^/]+\/open$/.test(url)) { open++; return json(open === 1 ? data.PACK_CARDS : data.PACK_CARDS_BRONZE); }
    if (url === '/api/collection') return json({ ...data.COLLECTION, packs: packs.slice(open) });
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"simulé"}' });
  });
  await page.addInitScript(user => {
    localStorage.setItem('token', 'jeton-simule');
    localStorage.setItem('user', JSON.stringify(user));
  }, data.USER);

  await page.goto('/packs?next=%2Fleagues%3Fjoin%3DK7PLQ2');
  await expect(page.getByText('Paquet 1 sur 2')).toBeVisible();
  await page.waitForTimeout(500);
  await shot(page, info.project.name, 'paquet-1-ferme');

  await page.getByRole('button', { name: 'Déchirer le paquet' }).last().click();
  await expect(page.getByText('Carte 1 sur 5')).toBeVisible();
  await shot(page, info.project.name, 'paquet-1-dos');

  // On retourne les cartes une à une : l'ordre annoncé va de la plus commune à la plus rare
  const seen: string[] = [];
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: 'Retourner la carte' }).first().click();
    await page.waitForTimeout(950);
    await shot(page, info.project.name, `paquet-1-carte-${i + 1}`);
    seen.push(await page.locator('main [aria-live="polite"]').last().innerText());
    await page.getByRole('button', { name: i === 4 ? 'Voir le récapitulatif' : 'Carte suivante' }).first().click();
    await page.waitForTimeout(250);
  }
  expect(seen[0]).toContain('Bronze');
  expect(seen[4]).toContain('Un Platine');

  await expect(page.getByRole('heading', { name: 'Dans ta collection' })).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, info.project.name, 'paquet-1-recap');
  await noOverflow(page);

  // Paquet suivant, puis fin : retour vers la ligue d'invitation
  await page.getByRole('button', { name: /Ouvrir le suivant/ }).click();
  await expect(page.getByText('Paquet 2 sur 2')).toBeVisible();
  await page.getByRole('button', { name: 'Déchirer le paquet' }).last().click();
  await page.getByRole('button', { name: 'Tout retourner d’un coup' }).click();
  await shot(page, info.project.name, 'paquet-2-recap');
  await page.getByRole('button', { name: 'Entrer dans le jeu' }).click();
  await expect(page).toHaveURL(/\/leagues\?join=K7PLQ2/);

  // Rejouer la page : les deux paquets sont ouverts, rien ne revient
  await page.goto('/packs');
  await expect(page.getByRole('heading', { name: 'Aucun paquet à ouvrir' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('composition : choisir une carte affiche le malus de poste avant de valider', async ({ page }, info) => {
  await mockApi(page, base);
  await page.goto(`${L}/lineup`);
  await page.getByRole('button', { name: /Arrière : .*Changer/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  // Un pivot à la mène : −35 % écrit en clair
  await expect(page.getByText(/Pivot à la mène, −35 %/).first()).toBeVisible();
  await page.waitForTimeout(300);
  await shot(page, info.project.name, 'composition-choix');
  await noOverflow(page);
});

test('cartes : le détail d’une carte s’ouvre et garde la place des futures actions', async ({ page }, info) => {
  await mockApi(page, base);
  await page.goto('/collection');
  await page.getByRole('button', { name: /Karim Benaïssa, Platine/ }).click();
  await expect(page.locator('[data-slot="card-actions"]')).toBeVisible();
  await page.waitForTimeout(300);
  await shot(page, info.project.name, 'cartes-detail');
});
