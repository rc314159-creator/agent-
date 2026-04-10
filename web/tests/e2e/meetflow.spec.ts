import { test, expect } from '@playwright/test';

test.describe('MeetFlow v2.1', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');
  });

  test('页面加载正常', async ({ page }) => {
    await page.screenshot({ path: '/tmp/e2e-v2.1-01-home.png', fullPage: true });
    await expect(page.locator('text=选择或创建一个项目')).toBeVisible();
  });

  test('创建新项目为空白状态', async ({ page }) => {
    const createBtn = page.locator('button:has-text("创建新项目")');
    if (await createBtn.isVisible()) {
      await createBtn.click();
    } else {
      await page.locator('button[title="新建项目"]').click();
    }
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/tmp/e2e-v2.1-02-new-project.png', fullPage: true });
    // 不应有硬编码内容"核心问题分析"
    const hardcoded = page.locator('text=核心问题分析');
    await expect(hardcoded).toHaveCount(0);
  });

  test('统一 AI 面板 — 四个 Tab', async ({ page }) => {
    // 选择已有项目（第一个）以确保有 currentProjectId
    await page.locator('nav a, aside li, [class*="project-item"]').first().click().catch(() => {});
    const firstProject = page.locator('aside button, aside a').first();
    if (await firstProject.isVisible()) {
      await firstProject.click();
    }
    await page.waitForTimeout(1000);

    // 使用键盘快捷键打开 AI 面板
    await page.keyboard.press('Meta+Slash');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/tmp/e2e-v2.1-03-ai-panel.png', fullPage: true });

    // 验证四个 Tab
    await expect(page.locator('button:has-text("对话")')).toBeVisible();
    await expect(page.locator('button:has-text("总结")')).toBeVisible();
    await expect(page.locator('button:has-text("搜索")')).toBeVisible();
    await expect(page.locator('button:has-text("自动填充")')).toBeVisible();
  });

  test('历史记录在项目面板而非 Sidebar', async ({ page }) => {
    const createBtn = page.locator('button:has-text("创建新项目")');
    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.waitForTimeout(1500);
    }
    // Sidebar（记录模式栏）不应有"历史记录"按钮
    const sidebarHistoryBtn = page.locator('aside:has-text("记录模式") button:has-text("历史记录")');
    await expect(sidebarHistoryBtn).toHaveCount(0);
    // ProjectPanel 区域应有"历史记录"按钮
    const projectPanelHistory = page.locator('button[title="历史记录"]');
    await expect(projectPanelHistory).toBeVisible();
    await page.screenshot({ path: '/tmp/e2e-v2.1-04-sidebar.png', fullPage: true });
  });
});
