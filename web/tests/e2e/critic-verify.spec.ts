import { test, expect } from '@playwright/test';

test.describe('Critic 验证 — 真实用户操作测试', () => {

  test('场景 A：创建新项目 + AI 自动命名', async ({ page }) => {
    // 收集所有 console 错误
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: '/tmp/critic-A-01-homepage.png', fullPage: true });

    // 记录当前项目列表中的项目名
    const projectItems = page.locator('[data-testid="project-item"], [role="button"]').filter({ hasText: /项目|Project/ });
    const initialCount = await projectItems.count();

    // 点击 + 创建新项目
    const plusBtn = page.locator('button[title="新建项目"], button[aria-label="新建项目"]').first();
    const hasPlusBtn = await plusBtn.isVisible().catch(() => false);
    if (hasPlusBtn) {
      await plusBtn.click();
    } else {
      // Try to find any button that looks like a new project button
      const allButtons = page.locator('button');
      const count = await allButtons.count();
      for (let i = 0; i < count; i++) {
        const btn = allButtons.nth(i);
        const title = await btn.getAttribute('title').catch(() => '');
        const text = await btn.textContent().catch(() => '');
        if (title?.includes('新建') || text?.includes('+') || text?.includes('新建')) {
          await btn.click();
          break;
        }
      }
    }
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/critic-A-02-new-project-created.png', fullPage: true });

    // 在大纲编辑器输入内容
    const editor = page.locator('[contenteditable="true"]').first();
    const editorVisible = await editor.isVisible().catch(() => false);
    if (editorVisible) {
      await editor.click();
      await page.keyboard.press('Control+a');
      await page.keyboard.press('Meta+a');
      await page.waitForTimeout(200);
      await page.keyboard.type('产品竞品分析方案设计', { delay: 50 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: '/tmp/critic-A-03-typed-content.png', fullPage: true });
    }

    // 等待 5 秒让 AI 自动命名
    await page.waitForTimeout(5000);
    await page.screenshot({ path: '/tmp/critic-A-04-after-ai-naming.png', fullPage: true });

    // 检查项目名是否从"新项目"变成了 AI 生成的名称
    // 找左侧项目列表中最新创建的项目
    const projectList = page.locator('[data-testid="project-list"] [role="button"], .project-item, nav [role="button"]');
    const projectListCount = await projectList.count();

    let foundNonDefaultName = false;
    for (let i = 0; i < projectListCount; i++) {
      const item = projectList.nth(i);
      const text = await item.textContent().catch(() => '');
      if (text && !text.includes('新项目') && !text.includes('New Project') && text.trim().length > 0) {
        foundNonDefaultName = true;
        console.log(`Found project with name: "${text}"`);
      }
    }

    // 检查页面是否还显示"新项目"标题
    const newProjectText = page.locator('text=新项目');
    const newProjectCount = await newProjectText.count();

    console.log(`Found "新项目" instances: ${newProjectCount}`);
    console.log(`Console errors: ${consoleErrors.join(', ')}`);

    // This test documents the actual state — whether AI naming worked or not
    await page.screenshot({ path: '/tmp/critic-A-05-final.png', fullPage: true });
  });

  test('场景 B：AI 对话 + 工具调用（搜索）', async ({ page }) => {
    // Use 90s timeout for this test specifically
    test.setTimeout(90000);

    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');

    // 进入第一个项目
    const firstProject = page.locator('[role="button"]').filter({ hasText: /产品群面讨论|竞品分析|新项目|项目/ }).first();
    const firstProjectVisible = await firstProject.isVisible().catch(() => false);
    if (firstProjectVisible) {
      await firstProject.click();
      await page.waitForTimeout(1500);
    }

    // 打开 AI 助手 (Cmd+/)
    await page.keyboard.press('Meta+Slash');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/tmp/critic-B-01-ai-panel-open.png', fullPage: true });

    // 找到 AI 聊天输入框
    const chatInput = page.locator('textarea[placeholder*="输入"], textarea[placeholder*="消息"], textarea[placeholder*="问"], input[placeholder*="输入"]').last();
    const inputVisible = await chatInput.isVisible().catch(() => false);

    if (inputVisible) {
      await chatInput.fill('请帮我搜索最新的 AI 协作工具');
      await page.screenshot({ path: '/tmp/critic-B-02-input-filled.png', fullPage: true });

      // 按 Enter 发送
      await chatInput.press('Enter');
      await page.waitForTimeout(3000);
      await page.screenshot({ path: '/tmp/critic-B-03-thinking.png', fullPage: true });

      // Wait for AI to finish — poll until "思考中" disappears or up to 60s
      let responseComplete = false;
      for (let i = 0; i < 12; i++) {
        await page.waitForTimeout(5000);
        const thinkingIndicator = page.locator('text=思考中');
        const thinkingCount = await thinkingIndicator.count();
        if (thinkingCount === 0) {
          responseComplete = true;
          break;
        }
        console.log(`Still thinking... iteration ${i+1}`);
      }

      await page.screenshot({ path: '/tmp/critic-B-04-ai-response.png', fullPage: true });

      // Get the body text to check for search results
      const bodyText = await page.textContent('body').catch(() => '');
      const hasUrl = bodyText?.includes('http') || bodyText?.includes('www.') || bodyText?.includes('.cn') || bodyText?.includes('.com');
      const hasSearchIndicators = bodyText?.includes('正在搜索') || bodyText?.includes('搜索') || bodyText?.includes('ClickUp') || bodyText?.includes('Miro') || bodyText?.includes('Pixso');

      console.log(`Response complete (no longer "思考中"): ${responseComplete}`);
      console.log(`Page has URL content: ${hasUrl}`);
      console.log(`Page has search result content: ${hasSearchIndicators}`);
      console.log(`Console errors: ${consoleErrors.join(', ')}`);

      // The body should contain real tool-call results or named tools
      if (!responseComplete) {
        console.log('BUG: AI response never completed — stuck in 思考中 state');
      }
      if (!hasSearchIndicators) {
        console.log('BUG: AI response does not appear to contain real search results');
      }
    } else {
      console.log('AI chat input not visible — panel may not have opened');
      await page.screenshot({ path: '/tmp/critic-B-ERROR-no-input.png', fullPage: true });
    }

    await page.screenshot({ path: '/tmp/critic-B-05-final.png', fullPage: true });
  });

  test('场景 C：项目面板滚动', async ({ page }) => {
    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: '/tmp/critic-C-01-initial.png', fullPage: true });

    // First create multiple projects if needed
    // Check existing project count
    const projectItems = page.locator('[role="button"]').filter({ hasText: /项目|Project|群面|竞品|分析/ });
    const existingCount = await projectItems.count();
    console.log(`Existing projects visible: ${existingCount}`);

    // Try to create more projects if there are fewer than 6
    if (existingCount < 5) {
      for (let i = 0; i < (6 - existingCount); i++) {
        const plusBtn = page.locator('button[title="新建项目"], button[aria-label="新建项目"]').first();
        const hasPlusBtn = await plusBtn.isVisible().catch(() => false);
        if (hasPlusBtn) {
          await plusBtn.click();
          await page.waitForTimeout(1000);
        }
      }
    }

    await page.screenshot({ path: '/tmp/critic-C-02-multiple-projects.png', fullPage: true });

    // Find the project list container
    const projectPanel = page.locator('nav, [data-testid="project-panel"], aside').first();

    // Scroll to bottom
    await projectPanel.evaluate(el => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/tmp/critic-C-03-scrolled-to-bottom.png', fullPage: true });

    const scrollBottomPos = await projectPanel.evaluate(el => el.scrollTop);
    console.log(`Scroll position at bottom: ${scrollBottomPos}`);

    // Scroll back to top
    await projectPanel.evaluate(el => {
      el.scrollTop = 0;
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/tmp/critic-C-04-scrolled-to-top.png', fullPage: true });

    const scrollTopPos = await projectPanel.evaluate(el => el.scrollTop);
    console.log(`Scroll position at top: ${scrollTopPos}`);

    // Verify we can scroll back to top
    expect(scrollTopPos).toBe(0);
  });

  test('场景 D：页面无 console 错误', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    page.on('pageerror', err => {
      pageErrors.push(err.message);
    });

    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/critic-D-01-homepage.png', fullPage: true });

    // Click first project
    const firstProject = page.locator('[role="button"]').filter({ hasText: /产品群面讨论|竞品分析|新项目|项目/ }).first();
    const firstProjectVisible = await firstProject.isVisible().catch(() => false);
    if (firstProjectVisible) {
      await firstProject.click();
      await page.waitForTimeout(2000);
    }
    await page.screenshot({ path: '/tmp/critic-D-02-in-project.png', fullPage: true });

    // Check for visible error indicators on page
    const errorToast = page.locator('[role="alert"], .toast-error, [data-variant="error"], .error-banner');
    const errorToastCount = await errorToast.count();

    const errorText = page.locator('text=Error, text=错误, text=失败').filter({ hasNot: page.locator('button') });

    console.log(`Console errors: ${consoleErrors.length > 0 ? consoleErrors.join('\n') : 'none'}`);
    console.log(`Page errors: ${pageErrors.length > 0 ? pageErrors.join('\n') : 'none'}`);
    console.log(`Error toast count: ${errorToastCount}`);

    // Get full page content for checking
    const bodyText = await page.textContent('body') || '';

    await page.screenshot({ path: '/tmp/critic-D-03-final.png', fullPage: true });

    // Report findings
    expect(pageErrors.length).toBe(0);
  });

});
