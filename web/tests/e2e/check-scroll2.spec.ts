import { test } from '@playwright/test';

test('check project panel scroll - full analysis', async ({ page }) => {
  test.setTimeout(30000);
  await page.goto('http://localhost:4927');
  await page.waitForLoadState('networkidle');

  // Count all project items
  const projectItems = await page.locator('[role="button"]').filter({ hasText: /项目|群面/ }).count();
  console.log(`Project items visible: ${projectItems}`);

  // Check all scroll areas
  const allScrollables = await page.evaluate(() => {
    const results: Array<{tag: string, class: string, scrollH: number, clientH: number, overflow: string}> = [];
    document.querySelectorAll('*').forEach(el => {
      const style = window.getComputedStyle(el);
      const overflow = style.overflow + ' ' + style.overflowY;
      if (overflow.includes('auto') || overflow.includes('scroll') || overflow.includes('hidden')) {
        const scrollH = (el as HTMLElement).scrollHeight;
        const clientH = (el as HTMLElement).clientHeight;
        if (scrollH > 0 && clientH > 0) {
          results.push({
            tag: el.tagName,
            class: el.className.toString().slice(0, 80),
            scrollH,
            clientH,
            overflow
          });
        }
      }
    });
    return results.slice(0, 20);
  });

  console.log('Scrollable elements:');
  allScrollables.forEach(el => {
    console.log(`  ${el.tag} [${el.class}]: scrollH=${el.scrollH} clientH=${el.clientH} overflow="${el.overflow}"`);
  });

  // Check all asides
  const asides = await page.locator('aside').all();
  console.log(`\nAside count: ${asides.length}`);
  for (let i = 0; i < asides.length; i++) {
    const aside = asides[i];
    const scrollH = await aside.evaluate(el => el.scrollHeight);
    const clientH = await aside.evaluate(el => el.clientHeight);
    const cls = await aside.getAttribute('class');
    console.log(`aside[${i}]: scrollH=${scrollH} clientH=${clientH} class="${cls?.slice(0, 60)}"`);
  }

  await page.screenshot({ path: '/tmp/check-scroll2.png', fullPage: true });
});
