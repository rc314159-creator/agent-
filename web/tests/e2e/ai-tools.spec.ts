import { test, expect } from '@playwright/test';

test.describe('AI 工具调用端到端验证', () => {

  test('AI 搜索工具 — 对话中自主搜索', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');

    // 1. 创建项目
    const createBtn = page.locator('button').filter({ hasText: /创建新项目|新建项目/ }).first();
    await createBtn.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/ai-tools-01-project.png', fullPage: true });

    // 2. 找到 AI 悬浮按钮并点击
    const aiFab = page.locator('button').filter({ has: page.locator('svg.lucide-message-square') }).first();
    if (await aiFab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await aiFab.click();
    } else {
      // 尝试键盘快捷键
      await page.keyboard.press('Meta+/');
    }
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/tmp/ai-tools-02-ai-open.png', fullPage: true });

    // 3. 找到输入框并输入
    const textarea = page.locator('textarea').last();
    await expect(textarea).toBeVisible({ timeout: 5000 });
    await textarea.fill('请搜索最新的产品管理工具有哪些');
    await page.screenshot({ path: '/tmp/ai-tools-03-input.png', fullPage: true });

    // 4. 按 Enter 发送
    await textarea.press('Enter');
    await page.waitForTimeout(25000); // 等待搜索+回复
    await page.screenshot({ path: '/tmp/ai-tools-04-response.png', fullPage: true });
  });

  test('新项目 AI 自动命名', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');

    // 1. 创建项目
    const createBtn = page.locator('button').filter({ hasText: /创建新项目|新建项目/ }).first();
    await createBtn.click();
    await page.waitForTimeout(3000);

    // 2. 确认编辑器可见
    const editor = page.locator('[contenteditable="true"]').first();
    await expect(editor).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: '/tmp/ai-tools-05-blank.png', fullPage: true });

    // 3. 输入内容
    await editor.click();
    await page.keyboard.type('竞品分析报告：飞书vs钉钉功能对比', { delay: 30 });
    await page.screenshot({ path: '/tmp/ai-tools-06-typed.png', fullPage: true });

    // 4. 等待 AI 命名
    await page.waitForTimeout(10000);
    await page.screenshot({ path: '/tmp/ai-tools-07-named.png', fullPage: true });
  });
});
