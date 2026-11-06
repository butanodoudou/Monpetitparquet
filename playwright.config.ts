import { defineConfig, devices } from '@playwright/test';

// Utilise le Chrome installé sur la machine : aucun navigateur à télécharger.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 13'], channel: 'chrome', browserName: 'chromium' } },
    { name: 'petit-ecran', use: { ...devices['iPhone 13'], viewport: { width: 360, height: 640 }, channel: 'chrome', browserName: 'chromium' } },
  ],
});
