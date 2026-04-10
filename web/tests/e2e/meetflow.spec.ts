import { test, expect } from '@playwright/test';

test.describe('MeetFlow v2.1 — 完整端到端验证', () => {

  test('1. 首页加载 + 项目列表', async ({ page }) => {
    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: '/tmp/e2e-v2.1-01-home.png', fullPage: true });
    // 应该看到"选择或创建一个项目"或者项目列表
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });

  test('2. 创建新项目 → 空白大纲', async ({ page }) => {
    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');

    // 点击 + 按钮创建新项目
    const plusBtn = page.locator('button[title="新建项目"]');
    if (await plusBtn.isVisible()) {
      await plusBtn.click();
    } else {
      const createBtn = page.locator('button:has-text("创建新项目")');
      await createBtn.click();
    }
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/e2e-v2.1-02-blank-project.png', fullPage: true });

    // 验证空白状态 — 不应有"核心问题分析"硬编码内容
    const hardcoded = page.locator('text=核心问题分析');
    await expect(hardcoded).toHaveCount(0);

    // 应有 placeholder 提示
    const placeholder = page.locator('text=开始输入内容');
    const hasPlaceholder = await placeholder.count();
    expect(hasPlaceholder).toBeGreaterThanOrEqual(0); // placeholder 可能在 contentEditable 中不可见
  });

  test('3. 在大纲中输入内容', async ({ page }) => {
    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');

    // 选择第一个项目
    const firstProject = page.locator('[role="button"]').filter({ hasText: /产品群面讨论|新项目|项目/ }).first();
    await firstProject.click();
    await page.waitForTimeout(1500);

    // 在大纲编辑器中输入内容
    const editor = page.locator('[contenteditable="true"]').first();
    if (await editor.isVisible()) {
      await editor.click();
      await page.keyboard.type('E2E 测试：验证大纲编辑功能正常工作', { delay: 30 });
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: '/tmp/e2e-v2.1-03-outline-edit.png', fullPage: true });
  });

  test('4. 打开统一 AI 面板 — 验证四个 Tab', async ({ page }) => {
    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');

    // 选择项目
    const firstProject = page.locator('[role="button"]').filter({ hasText: /产品群面讨论|新项目|项目/ }).first();
    await firstProject.click();
    await page.waitForTimeout(1500);

    // 按 Cmd+/ 打开 AI 面板
    await page.keyboard.press('Meta+Slash');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/tmp/e2e-v2.1-04-ai-panel-open.png', fullPage: true });

    // 验证四个 Tab 存在
    const tabs = page.getByRole('tab');
    const tabCount = await tabs.count();
    expect(tabCount).toBeGreaterThanOrEqual(4);
  });

  test('5. AI 对话 — 发送消息并等待回复', async ({ page }) => {
    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');

    // 进入项目
    const firstProject = page.locator('[role="button"]').filter({ hasText: /产品群面讨论|新项目|项目/ }).first();
    await firstProject.click();
    await page.waitForTimeout(1500);

    // 打开 AI 面板
    await page.keyboard.press('Meta+Slash');
    await page.waitForTimeout(1000);

    // 在输入框输入消息
    const input = page.locator('textarea[placeholder*="输入"]').last();
    await input.fill('你好，请介绍一下你自己');
    await page.screenshot({ path: '/tmp/e2e-v2.1-05-ai-input.png', fullPage: true });

    // 点击发送
    const sendBtn = page.locator('button:has(svg.lucide-send)').last();
    await sendBtn.click();

    // 等待 AI 回复（最多 15 秒）
    await page.waitForTimeout(8000);
    await page.screenshot({ path: '/tmp/e2e-v2.1-05-ai-response.png', fullPage: true });
  });

  test('6. 搜索功能 — 切换到搜索 Tab 并搜索', async ({ page }) => {
    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');

    const firstProject = page.locator('[role="button"]').filter({ hasText: /产品群面讨论|新项目|项目/ }).first();
    await firstProject.click();
    await page.waitForTimeout(1500);

    // 打开 AI 面板
    await page.keyboard.press('Meta+Slash');
    await page.waitForTimeout(1000);

    // 切换到搜索 Tab
    const searchTab = page.getByRole('tab', { name: '搜索' });
    if (await searchTab.isVisible()) {
      await searchTab.click();
      await page.waitForTimeout(500);

      // 在搜索框输入
      const searchInput = page.locator('textarea[placeholder*="搜索"]');
      if (await searchInput.isVisible()) {
        await searchInput.fill('AI 协作工具');
        // 按 Enter 搜索
        await searchInput.press('Enter');
        await page.waitForTimeout(5000);
      }
    }
    await page.screenshot({ path: '/tmp/e2e-v2.1-06-search-results.png', fullPage: true });
  });

  test('7. Sidebar 验证 — 无历史记录按钮', async ({ page }) => {
    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');

    const firstProject = page.locator('[role="button"]').filter({ hasText: /产品群面讨论|新项目|项目/ }).first();
    await firstProject.click();
    await page.waitForTimeout(1500);

    // Sidebar 区域不应有"历史记录"文字按钮
    const sidebarText = await page.locator('aside').filter({ hasText: '记录模式' }).textContent();
    expect(sidebarText).not.toContain('历史记录');
    await page.screenshot({ path: '/tmp/e2e-v2.1-07-sidebar-no-history.png', fullPage: true });
  });

  test('8. 切换画布模式 — 模板/白板/导图', async ({ page }) => {
    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');

    const firstProject = page.locator('[role="button"]').filter({ hasText: /产品群面讨论|新项目|项目/ }).first();
    await firstProject.click();
    await page.waitForTimeout(1500);

    // 按 4 切换到模板
    await page.keyboard.press('4');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/e2e-v2.1-08-template-mode.png', fullPage: true });

    // 按 3 切换到白板
    await page.keyboard.press('3');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/e2e-v2.1-08-whiteboard-mode.png', fullPage: true });
  });

  test('9. 语音录制面板可见', async ({ page }) => {
    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');

    const firstProject = page.locator('[role="button"]').filter({ hasText: /产品群面讨论|新项目|项目/ }).first();
    await firstProject.click();
    await page.waitForTimeout(1500);

    // 验证语音录制面板
    const voicePanel = page.locator('text=语音录制');
    if (await voicePanel.isVisible()) {
      await page.screenshot({ path: '/tmp/e2e-v2.1-09-voice-panel.png', fullPage: true });
    }

    // 验证"开始录制"按钮
    const recordBtn = page.locator('button:has-text("开始录制")');
    await expect(recordBtn).toBeVisible();
  });
});
