import { test, expect } from '@playwright/test';

test.describe('MeetFlow 完整群面记录演示', () => {

  test('完整流程：创建项目 → 编辑大纲 → AI分析 → 搜索 → 生成报告', async ({ page }) => {
    test.setTimeout(120000);
    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');

    // === 1. 进入项目 ===
    // 先尝试点击已有的第一个项目
    const firstProject = page.locator('[role="button"]').first();
    await firstProject.click();
    await page.waitForTimeout(2000);

    // 如果编辑器没出现，点创建新项目
    let editor = page.locator('[contenteditable="true"]').first();
    if (!await editor.isVisible({ timeout: 3000 }).catch(() => false)) {
      const createBtn = page.locator('button').filter({ hasText: /创建新项目/ }).first();
      await createBtn.click();
      await page.waitForTimeout(3000);
    }
    await page.screenshot({ path: '/tmp/demo-01-project-entered.png', fullPage: true });

    // === 2. 输入群面讨论大纲 ===
    editor = page.locator('[contenteditable="true"]').first();
    await expect(editor).toBeVisible({ timeout: 8000 });
    // 清空现有内容
    await editor.click();
    await page.keyboard.press('Meta+a');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(300);

    // 模拟群面讨论记录
    const outline = `产品经理群面讨论记录

一、讨论主题
设计一款面向大学生的AI学习助手App

二、用户需求分析
- 大学生课业繁重，需要高效整理笔记
- 考前复习缺乏系统性，需要AI生成知识图谱
- 小组讨论协作效率低，需要实时共享和总结

三、产品方案
1. 核心功能：AI笔记整理 + 知识图谱 + 协作白板
2. 技术方案：React Native + GPT API + 实时同步
3. 盈利模式：Freemium，高级AI功能付费

四、竞品分析
- Notion AI：功能强但学习成本高
- 有道云笔记：本土化好但AI弱
- Obsidian：极客向，不适合普通学生

五、分工与下一步
- 产品原型：小王负责
- 技术调研：小李负责
- 用户访谈：小张负责`;

    await page.keyboard.type(outline, { delay: 5 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/tmp/demo-02-outline-filled.png', fullPage: true });

    // === 3. 等待 AI 自动命名 ===
    await page.waitForTimeout(8000);
    await page.screenshot({ path: '/tmp/demo-03-ai-named.png', fullPage: true });

    // === 4. 打开 AI 助手，让 AI 分析讨论内容 ===
    const aiFab = page.locator('button').filter({ has: page.locator('svg.lucide-message-square') }).first();
    if (await aiFab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await aiFab.click();
    } else {
      await page.keyboard.press('Meta+/');
    }
    await page.waitForTimeout(1500);

    // 发送分析请求
    const textarea = page.locator('textarea').last();
    await expect(textarea).toBeVisible({ timeout: 5000 });
    await textarea.fill('请分析我们的群面讨论，指出方案的优势和不足，给出改进建议');
    await textarea.press('Enter');
    await page.waitForTimeout(15000);
    await page.screenshot({ path: '/tmp/demo-04-ai-analysis.png', fullPage: true });

    // === 5. 让 AI 搜索竞品信息 ===
    await textarea.fill('帮我搜索2026年最新的AI学习工具市场分析');
    await textarea.press('Enter');
    await page.waitForTimeout(20000);
    await page.screenshot({ path: '/tmp/demo-05-ai-search.png', fullPage: true });

    // === 6. 切换到搜索 Tab 独立搜索 ===
    const searchTab = page.getByRole('tab', { name: '搜索' });
    if (await searchTab.isVisible()) {
      await searchTab.click();
      await page.waitForTimeout(500);
      const searchInput = page.locator('textarea[placeholder*="搜索"]');
      if (await searchInput.isVisible()) {
        await searchInput.fill('大学生学习App市场规模');
        await searchInput.press('Enter');
        await page.waitForTimeout(8000);
      }
    }
    await page.screenshot({ path: '/tmp/demo-06-search-results.png', fullPage: true });

    // === 7. 切换到总结 Tab 生成报告 ===
    const summaryTab = page.getByRole('tab', { name: '总结' });
    if (await summaryTab.isVisible()) {
      await summaryTab.click();
      await page.waitForTimeout(500);
      const genBtn = page.locator('button').filter({ hasText: '生成总结' });
      if (await genBtn.isVisible()) {
        await genBtn.click();
        await page.waitForTimeout(15000);
      }
    }
    await page.screenshot({ path: '/tmp/demo-07-summary-report.png', fullPage: true });

    // === 8. 查看模板（SWOT分析）===
    // 关闭 AI 面板
    const closeBtn = page.locator('button:has(svg.lucide-x)').first();
    if (await closeBtn.isVisible()) await closeBtn.click();
    await page.waitForTimeout(500);

    await page.keyboard.press('4'); // 切换到模板
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/demo-08-template-list.png', fullPage: true });

    // === 9. 最终全景截图 ===
    await page.keyboard.press('1'); // 切回大纲
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/tmp/demo-09-final.png', fullPage: true });
  });
});
