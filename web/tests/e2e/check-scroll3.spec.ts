import { test, expect } from '@playwright/test';

test('check real scroll behavior', async ({ page }) => {
  test.setTimeout(30000);
  await page.goto('http://localhost:4927');
  await page.waitForLoadState('networkidle');

  // Find the element with overflow: scroll that we found
  const scrollEl = page.locator('div[class*="size-full"][class*="rounded-[inherit]"]').first();
  const exists = await scrollEl.count();
  console.log(`Found scroll element: ${exists}`);

  if (exists > 0) {
    const scrollH = await scrollEl.evaluate(el => el.scrollHeight);
    const clientH = await scrollEl.evaluate(el => el.clientHeight);
    const scrollTop = await scrollEl.evaluate(el => el.scrollTop);
    console.log(`scrollH=${scrollH} clientH=${clientH} scrollTop=${scrollTop} canScroll=${scrollH > clientH}`);

    // Scroll to bottom
    await scrollEl.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(300);
    const afterBottom = await scrollEl.evaluate(el => el.scrollTop);
    await page.screenshot({ path: '/tmp/real-scroll-bottom.png', fullPage: true });
    console.log(`After scroll to bottom: scrollTop=${afterBottom}`);

    // Scroll back to top
    await scrollEl.evaluate(el => { el.scrollTop = 0; });
    await page.waitForTimeout(300);
    const afterTop = await scrollEl.evaluate(el => el.scrollTop);
    await page.screenshot({ path: '/tmp/real-scroll-top.png', fullPage: true });
    console.log(`After scroll to top: scrollTop=${afterTop}`);

    expect(afterTop).toBe(0);
  }
});
