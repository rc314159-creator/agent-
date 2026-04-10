import { test } from '@playwright/test';

test('check project panel scroll', async ({ page }) => {
  test.setTimeout(30000);
  await page.goto('http://localhost:4927');
  await page.waitForLoadState('networkidle');

  // Find the scroll area - ScrollArea from Radix renders [data-radix-scroll-area-viewport]
  const scrollViewport = page.locator('[data-radix-scroll-area-viewport]').first();
  const exists = await scrollViewport.count();
  console.log(`Radix scroll viewport count: ${exists}`);

  if (exists > 0) {
    const scrollHeight = await scrollViewport.evaluate(el => el.scrollHeight);
    const clientHeight = await scrollViewport.evaluate(el => el.clientHeight);
    const currentScrollTop = await scrollViewport.evaluate(el => el.scrollTop);
    console.log(`scrollHeight=${scrollHeight} clientHeight=${clientHeight} scrollTop=${currentScrollTop} scrollable=${scrollHeight > clientHeight}`);

    // Try scrolling to bottom
    await scrollViewport.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(300);
    const afterBottom = await scrollViewport.evaluate(el => el.scrollTop);
    console.log(`After scroll to bottom: scrollTop=${afterBottom}`);

    // Try scrolling back to top
    await scrollViewport.evaluate(el => { el.scrollTop = 0; });
    await page.waitForTimeout(300);
    const afterTop = await scrollViewport.evaluate(el => el.scrollTop);
    console.log(`After scroll to top: scrollTop=${afterTop}`);
  }

  // Also check if there's an 'aside' with overflow
  const aside = page.locator('aside').first();
  const asideExists = await aside.count();
  if (asideExists > 0) {
    const asideScrollHeight = await aside.evaluate(el => el.scrollHeight);
    const asideClientHeight = await aside.evaluate(el => el.clientHeight);
    console.log(`aside scrollHeight=${asideScrollHeight} clientHeight=${asideClientHeight}`);
  }

  await page.screenshot({ path: '/tmp/check-scroll.png', fullPage: true });
});
