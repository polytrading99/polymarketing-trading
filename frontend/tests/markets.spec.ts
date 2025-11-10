import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/health', async (route) => {
    await route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) });
  });

  await page.route('**/markets', async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify([
        { id: 1, name: 'Election', external_id: 'election', base_spread_bps: 50, enabled: true },
        { id: 2, name: 'Sports', external_id: 'sports', base_spread_bps: 75, enabled: false },
      ]),
      headers: { 'content-type': 'application/json' },
    });
  });
});

test('renders market list and handles start button', async ({ page }) => {
  await page.route('**/markets/1/start', async (route) => {
    await route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) });
  });

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Markets' })).toBeVisible();
  const firstRow = page.getByRole('listitem').first();
  await expect(firstRow).toContainText('Election');

  const startButton = page.getByRole('button', { name: 'Start' }).first();
  await expect(startButton).toBeEnabled();
  await startButton.click();
  await expect(page.getByText('Started market #1')).toBeVisible();
});

