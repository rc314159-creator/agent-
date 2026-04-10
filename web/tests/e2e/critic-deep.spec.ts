import { test, expect } from '@playwright/test';

/**
 * Deep bug hunting — examines specific suspicious areas found in code review.
 */

test.describe('Critic Deep Audit', () => {

  // Bug check: Voice recording does not actually start in test env (getUserMedia fails silently)
  test('BUG HUNT: 录音按钮点击后无反应', async ({ page }) => {
    test.setTimeout(30000);

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', msg => {
      consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', e => pageErrors.push(e.message));

    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');

    // Open or create a project
    const plusBtn = page.locator('button[title="新建项目"]').first();
    await plusBtn.click();
    await page.waitForTimeout(1500);

    // Click 开始录制
    const startBtn = page.locator('button').filter({ hasText: '开始录制' });
    await expect(startBtn).toBeVisible({ timeout: 5000 });
    await startBtn.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/critic-fix-deep-01-after-record-click.png', fullPage: true });

    // After click: recording state
    const bodyText = await page.textContent('body') || '';
    const isRecordingActive = bodyText.includes('停止录制');
    const hasTimer = bodyText.match(/\d\d:\d\d:\d\d/);
    const hasMicPermError = bodyText.includes('麦克风权限被拒绝');
    const hasAsrError = bodyText.includes('语音识别');

    console.log(`Recording active (shows "停止录制"): ${isRecordingActive}`);
    console.log(`Timer visible: ${!!hasTimer}`);
    console.log(`Mic permission error: ${hasMicPermError}`);
    console.log(`ASR error shown: ${hasAsrError}`);

    if (!isRecordingActive && !hasMicPermError) {
      // Check why — look at console logs
      const relevantLogs = consoleErrors.filter(e =>
        e.includes('getUserMedia') || e.includes('microphone') || e.includes('麦克风') || e.includes('MediaDevices')
      );
      console.log(`BUG: Recording button clicked but no state change. Relevant console: ${relevantLogs.join('; ')}`);
      console.log(`All console errors: ${consoleErrors.filter(e => e.startsWith('[error]')).join('\n')}`);
    }

    // In Playwright, getUserMedia requires explicit permission grant
    // Check if the page requested microphone access
    console.log(`Page errors: ${pageErrors.join('\n') || 'none'}`);
    console.log(`All console messages: ${consoleErrors.join('\n')}`);
  });

  // Bug check: AIPanel returns null — it's registered in page.tsx but provides nothing
  test('BUG HUNT: AIPanel 渲染为 null', async ({ page }) => {
    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');

    // Create project
    const plusBtn = page.locator('button[title="新建项目"]').first();
    await plusBtn.click();
    await page.waitForTimeout(1500);

    // Check if AIPanel renders anything at the bottom of the canvas area
    // AIPanel is placed after VoicePanel in the canvas flex column
    // In the code, AIPanel returns null, so it contributes no DOM
    // This is a dead import — check if it causes any layout issues
    await page.screenshot({ path: '/tmp/critic-fix-deep-02-aipanel-check.png', fullPage: true });

    // The AIPanel component literally does: return null;
    // This means it occupies no space, but it IS imported and mounted
    // If it causes React errors, we'd see them here
    const pageErrors: string[] = [];
    page.on('pageerror', e => pageErrors.push(e.message));

    // Reload to catch errors from the start
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    expect(pageErrors.length).toBe(0);
    console.log(`AIPanel null return causes no page errors: ${pageErrors.length === 0}`);
  });

  // Bug check: Header title is hardcoded "智能协作助手讨论" and not project-aware
  test('BUG HUNT: Header 标题与项目名不同步', async ({ page }) => {
    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');

    // Create project A
    const plusBtn = page.locator('button[title="新建项目"]').first();
    await plusBtn.click();
    await page.waitForTimeout(1500);

    // Type content to trigger AI naming
    const editor = page.locator('[contenteditable="true"]').first();
    await editor.click();
    await page.keyboard.type('产品战略规划', { delay: 50 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: '/tmp/critic-fix-deep-03-header-check.png', fullPage: true });

    // Check header title
    const header = page.locator('header');
    const headerText = await header.textContent() || '';

    // Check if header shows "智能协作助手讨论" or the project-specific name
    const hasHardcodedTitle = headerText.includes('智能协作助手讨论');
    const hasMidflowBranding = headerText.includes('Midflow');
    console.log(`Header has hardcoded "智能协作助手讨论": ${hasHardcodedTitle}`);
    console.log(`Header shows "Midflow": ${hasMidflowBranding}`);

    if (hasHardcodedTitle) {
      console.log('BUG: Header title is hardcoded as "智能协作助手讨论" — not derived from project name');
      console.log('      Header state in Header.tsx uses useState with static initial value');
    }

    // Wait for AI naming to potentially kick in (3s debounce + AI call)
    await page.waitForTimeout(8000);
    await page.screenshot({ path: '/tmp/critic-fix-deep-04-after-ai-naming.png', fullPage: true });

    // Check if project was renamed in sidebar
    const sidebarText = await page.locator('aside').first().textContent() || '';
    const hasOriginalName = sidebarText.includes('新项目');
    const wasRenamed = !sidebarText.includes('新项目 2026') || sidebarText.includes('产品') || sidebarText.includes('战略');
    console.log(`Project renamed by AI: ${wasRenamed}, sidebar: "${sidebarText.substring(0, 100)}"`);
  });

  // Bug check: "导出" button shows alert() which is blocking — poor UX
  test('BUG HUNT: 占位按钮使用 alert()', async ({ page }) => {
    const dialogTexts: string[] = [];
    page.on('dialog', async dialog => {
      dialogTexts.push(dialog.message());
      await dialog.dismiss();
    });

    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');

    // Create project to show sidebar
    const plusBtn = page.locator('button[title="新建项目"]').first();
    await plusBtn.click();
    await page.waitForTimeout(1500);

    // Click "导出" button in Sidebar
    const exportBtn = page.locator('button').filter({ hasText: '导出' });
    const exportCount = await exportBtn.count();
    console.log(`Export buttons found: ${exportCount}`);

    if (exportCount > 0) {
      await exportBtn.first().click();
      await page.waitForTimeout(500);
    }

    // Click share button in header
    const shareBtn = page.locator('button[title="分享"]');
    const shareVisible = await shareBtn.isVisible().catch(() => false);
    if (shareVisible) {
      await shareBtn.click();
      await page.waitForTimeout(500);
    }

    console.log(`Alert dialogs triggered: ${dialogTexts.length}`);
    console.log(`Dialog messages: ${dialogTexts.join(', ')}`);

    if (dialogTexts.length > 0) {
      console.log('BUG: Placeholder buttons use blocking alert() — should use toast() instead');
      dialogTexts.forEach(msg => console.log(`  - alert("${msg}")`));
    }
  });

  // Bug check: saveField uses a shared debounce timer — switching projects during debounce
  // may save wrong data to wrong project
  test('BUG HUNT: saveField 竞态条件（快速切换项目）', async ({ page }) => {
    test.setTimeout(30000);

    const networkRequests: Array<{ url: string; method: string; body: string }> = [];
    page.on('request', req => {
      if (req.url().includes('/api/projects') && req.method() === 'PUT') {
        networkRequests.push({
          url: req.url(),
          method: req.method(),
          body: req.postData() || ''
        });
      }
    });

    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');

    const plusBtn = page.locator('button[title="新建项目"]').first();

    // Create Project A
    await plusBtn.click();
    await page.waitForTimeout(1500);
    const editorA = page.locator('[contenteditable="true"]').first();
    await editorA.click();
    await page.keyboard.type('Project A specific content', { delay: 30 });
    // Don't wait — immediately switch to see if race condition occurs

    // Get Project A ID from URL requests
    await page.waitForTimeout(200);

    // Create Project B (switching projects)
    await plusBtn.click();
    await page.waitForTimeout(200); // Very short wait to simulate fast switching

    // Type in Project B
    const editorB = page.locator('[contenteditable="true"]').first();
    await editorB.click();
    await page.keyboard.type('Project B specific content', { delay: 30 });

    // Wait for all debounced saves to fire (500ms debounce)
    await page.waitForTimeout(2000);

    // Analyze network requests
    console.log(`PUT requests to /api/projects: ${networkRequests.length}`);
    networkRequests.forEach(req => {
      const projectId = req.url.split('/api/projects/')[1]?.split('?')[0];
      const body = req.body.substring(0, 100);
      console.log(`  PUT /api/projects/${projectId}: ${body}`);
    });

    // Look for potential cross-contamination: Project A's ID receiving Project B's content or vice versa
    const uniqueProjectIds = new Set(networkRequests.map(r => r.url.split('/api/projects/')[1]?.split('?')[0]));
    console.log(`Unique project IDs that received PUT: ${[...uniqueProjectIds].join(', ')}`);

    await page.screenshot({ path: '/tmp/critic-fix-deep-05-race-condition.png', fullPage: true });
  });

  // Bug check: AIChatSidebar search functionality
  test('BUG HUNT: AI 聊天侧边栏搜索', async ({ page }) => {
    test.setTimeout(30000);

    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');

    const plusBtn = page.locator('button[title="新建项目"]').first();
    await plusBtn.click();
    await page.waitForTimeout(1500);

    // Open AI panel
    await page.keyboard.press('Meta+Slash');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/tmp/critic-fix-deep-06-ai-sidebar.png', fullPage: true });

    // Find search tab
    const searchTab = page.locator('button, [role="tab"]').filter({ hasText: /搜索|Search/ });
    const searchCount = await searchTab.count();
    console.log(`Search tabs found: ${searchCount}`);

    if (searchCount > 0) {
      await searchTab.first().click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: '/tmp/critic-fix-deep-07-search-tab.png', fullPage: true });

      // Try to search
      const searchInput = page.locator('input[placeholder*="搜索"], input[type="search"], textarea[placeholder*="搜索"]');
      const searchInputVisible = await searchInput.isVisible().catch(() => false);
      console.log(`Search input visible: ${searchInputVisible}`);

      if (searchInputVisible) {
        await searchInput.fill('产品管理');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(5000);
        await page.screenshot({ path: '/tmp/critic-fix-deep-08-search-results.png', fullPage: true });

        const bodyText = await page.textContent('body') || '';
        const hasResults = bodyText.includes('产品管理') || bodyText.includes('搜索');
        console.log(`Search results shown: ${hasResults}`);
      }
    }
  });

});
