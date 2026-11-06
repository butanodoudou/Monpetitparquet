import { expect, test } from '@playwright/test';

test.describe('écran d’accueil', () => {
  test('tient dans la largeur, sans erreur de page', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto('/auth');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBe(0);
    expect(errors).toEqual([]);
  });

  test('le pseudo s’écrit sur la carte', async ({ page }) => {
    await page.goto('/auth');
    await page.getByLabel('Ton nom de manager').fill('Duyen');
    await expect(page.locator('.mc-name')).toHaveText('Duyen');
  });

  test('un pseudo de 20 caractères tient sur la carte', async ({ page }) => {
    await page.goto('/auth');
    await page.getByLabel('Ton nom de manager').fill('Maximilien Dupontel1');
    const clipped = await page.locator('.mc-name').evaluate(el => el.scrollWidth > el.clientWidth);
    expect(clipped).toBe(false);
  });

  test('un manager existant peut coller son lien', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('button', { name: "J'ai déjà un compte" }).click();
    await expect(page.getByRole('heading', { name: 'Content de te revoir.' })).toBeVisible();

    await page.getByLabel('Ton lien personnel').fill('pas un lien');
    await page.getByRole('button', { name: 'Me reconnecter' }).click();
    await expect(page.getByText('Ce texte ne contient pas de lien personnel.')).toBeVisible();
  });
});

test('la page des règles s’ouvre sans erreur', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto('/rules');
  await expect(page.getByRole('heading').first()).toBeVisible();
  expect(errors).toEqual([]);
});
