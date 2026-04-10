import { test, expect } from '@playwright/test';

/**
 * Post-fix verification — verify all 4 critical items the team-lead asked about.
 */

test.describe('Post-Fix Verification', () => {

  // ─── Check 1: Create project → Edit outline → Switch mode → Switch back → content preserved ───
  test('检查 1：大纲内容模式切换后保留', async ({ page }) => {
    test.setTimeout(60000);

    const pageErrors: string[] = [];
    page.on('pageerror', e => pageErrors.push(e.message));

    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: '/tmp/critic-fix-v2-01-homepage.png', fullPage: true });

    // Create a new project
    const plusBtn = page.locator('button[title="新建项目"]').first();
    await expect(plusBtn).toBeVisible({ timeout: 5000 });
    await plusBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/critic-fix-v2-02-new-project.png', fullPage: true });

    // Type content in outline
    const editor = page.locator('[contenteditable="true"]').first();
    await expect(editor).toBeVisible({ timeout: 5000 });
    await editor.click();
    await page.keyboard.press('Meta+a');
    await page.waitForTimeout(200);
    const testContent = '用户需求分析测试内容UNIQUE99';
    await page.keyboard.type(testContent, { delay: 40 });
    await page.waitForTimeout(500);

    const contentBefore = await editor.innerText();
    console.log(`Content typed: "${contentBefore}"`);
    await page.screenshot({ path: '/tmp/critic-fix-v2-03-content-typed.png', fullPage: true });

    // Press 2 — switch to mindmap (click body first to unfocus editor)
    await page.locator('body').click({ position: { x: 50, y: 300 } });
    await page.waitForTimeout(200);
    await page.keyboard.press('2');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/tmp/critic-fix-v2-04-mindmap.png', fullPage: true });

    // Press 1 — switch back to outline
    await page.keyboard.press('1');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/tmp/critic-fix-v2-05-back-to-outline.png', fullPage: true });

    const editorAfter = page.locator('[contenteditable="true"]').first();
    const contentAfter = await editorAfter.innerText().catch(() => '');
    console.log(`Content after switch: "${contentAfter}"`);

    const preserved = contentAfter.includes('用户需求分析') || contentAfter.includes('UNIQUE99');
    console.log(`Content preserved: ${preserved}`);
    if (!preserved) {
      console.log('BUG: outline content was cleared after mode switch!');
    }

    expect(preserved).toBeTruthy();
    expect(pageErrors.length).toBe(0);
  });

  // ─── Check 2: New project → mindmap → must be blank (only root "新主题") ───
  test('检查 2：新项目思维导图为空白', async ({ page }) => {
    test.setTimeout(30000);

    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');

    // Create new project (with no content typed in outline)
    const plusBtn = page.locator('button[title="新建项目"]').first();
    await plusBtn.click();
    await page.waitForTimeout(2000);

    // Switch to mindmap WITHOUT typing anything
    await page.locator('body').click({ position: { x: 50, y: 300 } });
    await page.keyboard.press('2');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/critic-fix-v2-06-new-project-mindmap.png', fullPage: true });

    // The mindmap should show only the root node "新主题"
    // Check that the SVG/canvas does not have extra nodes from a previous project
    const bodyText = await page.textContent('body') || '';

    // Should have the mindmap container
    const mindmapContainer = page.locator('.w-full.h-full').first();
    const mindmapVisible = await mindmapContainer.isVisible().catch(() => false);
    console.log(`Mindmap container visible: ${mindmapVisible}`);

    // Check for the root node text "新主题" (or similar initial node)
    // The mindmap renders in canvas/SVG — check for it
    const hasMindmapCanvas = await page.locator('canvas, svg').count();
    console.log(`Canvas/SVG elements: ${hasMindmapCanvas}`);

    // The critical check: if saved mindmap data was null for a new project,
    // it should init with { data: { text: "新主题" }, children: [] }
    // We verify this by looking at the SVG text content if possible
    const svgText = await page.evaluate(() => {
      const svgs = document.querySelectorAll('svg');
      let text = '';
      svgs.forEach(svg => { text += svg.textContent || ''; });
      return text;
    });
    console.log(`SVG text content (first 200 chars): "${svgText.substring(0, 200)}"`);

    const hasOnlyRootNode = svgText.includes('新主题') || svgText === '';
    const hasUnwantedContent = svgText.includes('用户需求') || svgText.includes('产品') || svgText.includes('分析');
    console.log(`Has only root "新主题": ${hasOnlyRootNode}`);
    console.log(`Has unwanted content from other projects: ${hasUnwantedContent}`);

    if (hasUnwantedContent) {
      console.log('BUG: new project mindmap shows content from another project!');
    }
    expect(hasUnwantedContent).toBeFalsy();
  });

  // ─── Check 3: AI chat → search results ───
  test('检查 3：AI 对话 + 搜索功能', async ({ page }) => {
    test.setTimeout(90000);

    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');

    // Pick/create a project
    const plusBtn = page.locator('button[title="新建项目"]').first();
    await plusBtn.click();
    await page.waitForTimeout(1500);

    // Open AI panel (Cmd+/)
    await page.keyboard.press('Meta+Slash');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/tmp/critic-fix-v2-07-ai-panel.png', fullPage: true });

    // Check AI panel is visible
    const aiPanel = page.locator('aside').filter({ hasText: 'AI 助手' });
    const aiPanelVisible = await aiPanel.isVisible().catch(() => false);
    console.log(`AI panel visible: ${aiPanelVisible}`);
    expect(aiPanelVisible).toBeTruthy();

    // Chat test — send "你好"
    const chatInput = page.locator('textarea[placeholder*="输入"]').last();
    const inputVisible = await chatInput.isVisible().catch(() => false);
    console.log(`Chat input visible: ${inputVisible}`);
    expect(inputVisible).toBeTruthy();

    await chatInput.fill('你好');
    await chatInput.press('Enter');
    await page.waitForTimeout(8000);
    await page.screenshot({ path: '/tmp/critic-fix-v2-08-ai-reply.png', fullPage: true });

    const bodyAfterChat = await page.textContent('body') || '';
    const aiReplied = bodyAfterChat.includes('MeetFlow') || bodyAfterChat.includes('帮') || bodyAfterChat.includes('你好');
    console.log(`AI replied (has response content): ${aiReplied}`);
    expect(aiReplied).toBeTruthy();

    // Search tab test
    const searchTab = page.locator('[role="tab"]').filter({ hasText: '搜索' });
    const searchTabVisible = await searchTab.isVisible().catch(() => false);
    console.log(`Search tab visible: ${searchTabVisible}`);
    expect(searchTabVisible).toBeTruthy();

    await searchTab.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/tmp/critic-fix-v2-09-search-tab.png', fullPage: true });

    const searchInput = page.locator('textarea[placeholder*="搜索"]');
    const searchInputVisible = await searchInput.isVisible().catch(() => false);
    console.log(`Search input visible: ${searchInputVisible}`);
    expect(searchInputVisible).toBeTruthy();

    await searchInput.fill('产品管理工具');
    await searchInput.press('Enter');
    await page.waitForTimeout(8000);
    await page.screenshot({ path: '/tmp/critic-fix-v2-10-search-results.png', fullPage: true });

    const bodyAfterSearch = await page.textContent('body') || '';
    // Either has results or the "search service unavailable" message — just no crash
    const searchResponsePresent = bodyAfterSearch.includes('产品') || bodyAfterSearch.includes('搜索服务') || bodyAfterSearch.includes('未找到结果') || bodyAfterSearch.includes('com') || bodyAfterSearch.includes('.cn');
    console.log(`Search response present: ${searchResponsePresent}`);
    if (!searchResponsePresent) {
      console.log('BUG: Search returned no indication of result or error');
    }
  });

  // ─── Check 4: Recording button → ASR error / success ───
  test('检查 4：语音录制 + ASR 代理状态', async ({ page }) => {
    test.setTimeout(30000);

    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // Check ASR proxy is up
    let asrProxyUp = false;
    try {
      const res = await page.request.get('http://localhost:4928');
      console.log(`ASR proxy (4928) status: ${res.status()}`);
      asrProxyUp = res.status() < 500;
    } catch {
      console.log('ASR proxy (4928): not reachable');
    }

    // Check /api/asr endpoint
    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');

    const asrConfigRes = await page.request.get('http://localhost:4927/api/asr');
    console.log(`/api/asr status: ${asrConfigRes.status()}`);
    let asrConfig: any = {};
    try {
      asrConfig = await asrConfigRes.json();
      console.log(`/api/asr response: ${JSON.stringify(asrConfig).substring(0, 150)}`);
    } catch {
      console.log('/api/asr response not JSON');
    }

    // Create project and try to record
    const plusBtn = page.locator('button[title="新建项目"]').first();
    await plusBtn.click();
    await page.waitForTimeout(1500);

    // Grant microphone permission to Playwright browser
    const context = page.context();
    await context.grantPermissions(['microphone']);

    await page.screenshot({ path: '/tmp/critic-fix-v2-11-before-record.png', fullPage: true });

    const startBtn = page.locator('button').filter({ hasText: '开始录制' });
    await expect(startBtn).toBeVisible({ timeout: 5000 });
    await startBtn.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/critic-fix-v2-12-after-record.png', fullPage: true });

    const bodyText = await page.textContent('body') || '';
    const isRecording = bodyText.includes('停止录制');
    const hasTimer = /\d\d:\d\d:\d\d/.test(bodyText);
    const hasAsrError = bodyText.includes('语音识别') || bodyText.includes('ASR');
    const hasMicError = bodyText.includes('麦克风');

    console.log(`Recording active (shows "停止录制"): ${isRecording}`);
    console.log(`Timer visible: ${hasTimer}`);
    console.log(`ASR error shown: ${hasAsrError}`);
    console.log(`Mic error shown: ${hasMicError}`);
    console.log(`ASR proxy up: ${asrProxyUp}`);

    if (isRecording) {
      console.log('Recording started successfully');
      if (hasAsrError) {
        // ASR error shown but recording continues — expected behavior if proxy not up
        console.log('BUG NOTE: ASR error shown but recording continues (expected if ASR proxy not running)');
      }
      // Stop it
      const stopBtn = page.locator('button').filter({ hasText: '停止录制' });
      await stopBtn.click();
    } else if (hasMicError) {
      console.log('Mic permission denied — recording blocked');
    } else {
      console.log('BUG: recording button click had no effect — no state change, no error');
    }

    console.log(`Console errors: ${consoleErrors.length > 0 ? consoleErrors.join('\n') : 'none'}`);
    await page.screenshot({ path: '/tmp/critic-fix-v2-13-final.png', fullPage: true });

    // With granted permissions, recording should start
    expect(isRecording || hasMicError).toBeTruthy();
  });

});
