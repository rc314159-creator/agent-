import { test } from '@playwright/test';

test('check alert elements', async ({ page }) => {
  await page.goto('http://localhost:4927');
  await page.waitForLoadState('networkidle');

  const alerts = await page.locator('[role="alert"]').all();
  console.log(`Alert count: ${alerts.length}`);
  for (const alert of alerts) {
    const text = await alert.textContent();
    const visible = await alert.isVisible();
    const html = await alert.innerHTML().catch(() => '');
    console.log(`Alert: visible=${visible}, text="${text}", html="${html.slice(0, 200)}"`);
  }

  // Also check project panel scroll
  const nav = page.locator('nav').first();
  const navScrollHeight = await nav.evaluate(el => el.scrollHeight);
  const navClientHeight = await nav.evaluate(el => el.clientHeight);
  const navScrollable = navScrollHeight > navClientHeight;
  console.log(`Nav scrollHeight=${navScrollHeight} clientHeight=${navClientHeight} scrollable=${navScrollable}`);

  await page.screenshot({ path: '/tmp/check-alert.png', fullPage: true });
});
