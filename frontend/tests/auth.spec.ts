import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/health', async (route) => {
    await route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) });
  });
  await page.route('**/markets', async (route) => {
    await route.fulfill({ status: 200, body: JSON.stringify([]) });
  });
});

test('connect wallet button toggles when MetaMask is available', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).ethereum = {
      request: async ({ method, params }: { method: string; params?: any[] }) => {
        switch (method) {
          case 'eth_requestAccounts':
            return ['0x1234567890abcdef1234567890abcdef12345678'];
          case 'personal_sign':
            return '0xsigned';
          default:
            return params;
        }
      },
    };
  });

  await page.route('**/auth/nonce', async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({
        address: '0x1234567890abcdef1234567890abcdef12345678',
        nonce: 'nonce',
        message: 'Sign this message to authenticate: nonce',
      }),
    });
  });

  await page.route('**/auth/verify', async (route) => {
    await route.fulfill({
      status: 200,
      body: JSON.stringify({
        token: 'jwt-token',
        address: '0x1234567890abcdef1234567890abcdef12345678',
      }),
    });
  });

  await page.goto('/');

  const connectButton = page.getByRole('button', { name: 'Connect wallet' });
  await connectButton.click();

  await expect(page.getByRole('button', { name: /0x1234/i })).toBeVisible();
});

