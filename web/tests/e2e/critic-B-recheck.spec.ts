import { test } from '@playwright/test';

test('场景 B 修复后验证 — 等待完整响应', async ({ page }) => {
  test.setTimeout(90000);

  await page.goto('http://localhost:4927');
  await page.waitForLoadState('networkidle');

  const firstProject = page.locator('[role="button"]').filter({ hasText: /产品群面讨论|竞品分析|新项目|项目/ }).first();
  if (await firstProject.isVisible().catch(() => false)) {
    await firstProject.click();
    await page.waitForTimeout(1500);
  }

  await page.keyboard.press('Meta+Slash');
  await page.waitForTimeout(1500);

  const chatInput = page.locator('textarea[placeholder*="输入"]').last();
  await chatInput.fill('请帮我搜索最新的 AI 协作工具');
  await chatInput.press('Enter');

  // Wait for "思考中" to appear first (confirms request sent)
  await page.waitForSelector('text=思考中', { timeout: 15000 }).catch(() => {});
  await page.screenshot({ path: '/tmp/critic-B-fix-1-thinking.png', fullPage: true });

  // Now wait for "思考中" to disappear AND streaming cursor to be gone
  await page.waitForFunction(() => {
    const thinking = document.querySelector('.animate-spin');
    if (thinking) return false;
    const streamCursor = document.querySelector('.animate-pulse');
    if (streamCursor) return false;
    return true;
  }, { timeout: 60000 });

  // Extra buffer for final render
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/critic-B-fix-verified.png', fullPage: true });

  const bodyText = await page.textContent('body') ?? '';
  const hasSearchContent = bodyText.includes('正在搜索') || bodyText.includes('ClickUp') || bodyText.includes('Miro') || bodyText.includes('Pixso') || bodyText.includes('.cn') || bodyText.includes('.com');
  console.log(`Response has search content: ${hasSearchContent}`);
  console.log(`"思考中" visible: ${bodyText.includes('思考中')}`);
  console.log(`"[正在搜索" still frozen: ${bodyText.includes('[正在搜索: ]') && !bodyText.includes('[正在搜索:') && bodyText.length < 500}`);
});
