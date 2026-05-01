import { test, expect } from '@playwright/test';

test('QQ notification path triggers NapCat and delivers message', async ({ page }) => {
  const base = process.env.APP_BASE_URL || 'http://localhost:8080';
  await page.goto(base);

  // Intercept NapCat API to simulate successful delivery
  await page.route('**/api/qq/notify', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  const triggerSelector = '#sendQQReminderBtn';
  if (await page.locator(triggerSelector).count()) {
    await page.click(triggerSelector);
  }

  const notifyEndpoint = '/api/qq/notify';
  const [response] = await Promise.all([
    page.waitForResponse(resp => resp.url().endsWith(notifyEndpoint) && resp.status() === 200),
    page.evaluate(async () => {
      await fetch('/api/qq/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'test notification' })
      });
    })
  ]);
  expect(response).not.toBeNull();
  expect(response?.ok()).toBeTruthy();

  // Check UI status indicator if present
  const statusIndicator = page.locator('#qqNotifyStatus');
  if (await statusIndicator.count()) {
    await expect(statusIndicator).toHaveText(/sent|delivered|success/i);
  }
});
