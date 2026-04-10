import { test, expect } from '@playwright/test';

/**
 * Post-fix verification v3 — focused, clean checks.
 * Each test reuses the same page URL but with precise scope.
 */

test.describe('Post-Fix Verification v3', () => {

  // ─── Check 1: Outline content survives mode switch ───────────────────────
  test('检查 1：大纲内容模式切换后保留', async ({ page }) => {
    test.setTimeout(60000);

    const pageErrors: string[] = [];
    page.on('pageerror', e => pageErrors.push(e.message));

    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');

    // Create fresh project
    const plusBtn = page.locator('button[title="新建项目"]').first();
    await plusBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/critic-fix-v3-01-new-project.png', fullPage: true });

    // Type in outline
    const editor = page.locator('[contenteditable="true"]').first();
    await expect(editor).toBeVisible({ timeout: 5000 });
    await editor.click();
    await page.keyboard.press('Meta+a');
    await page.waitForTimeout(200);
    await page.keyboard.type('用户需求分析UNIQUE99', { delay: 40 });
    await page.waitForTimeout(500);

    const contentBefore = await editor.innerText();
    console.log(`Step 2 — content typed: "${contentBefore}"`);
    await page.screenshot({ path: '/tmp/critic-fix-v3-02-content-typed.png', fullPage: true });

    // Switch to mindmap (click away from editor first)
    await page.locator('body').click({ position: { x: 50, y: 300 } });
    await page.waitForTimeout(200);
    await page.keyboard.press('2');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/tmp/critic-fix-v3-03-mindmap.png', fullPage: true });

    // Switch back to outline
    await page.keyboard.press('1');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/tmp/critic-fix-v3-04-back-outline.png', fullPage: true });

    const editorAfter = page.locator('[contenteditable="true"]').first();
    const contentAfter = await editorAfter.innerText().catch(() => '');
    console.log(`Step 4 — content after switch: "${contentAfter}"`);

    const preserved = contentAfter.includes('UNIQUE99');
    if (!preserved) {
      console.log(`BUG: Outline content cleared after mode switch! Got: "${contentAfter}"`);
    }

    expect(preserved).toBeTruthy();
    expect(pageErrors.length).toBe(0);
  });

  // ─── Check 2: New project mindmap is blank ───────────────────────────────
  test('检查 2：新项目思维导图为空白', async ({ page }) => {
    test.setTimeout(30000);

    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');

    // Create brand new project (no outline content)
    const plusBtn = page.locator('button[title="新建项目"]').first();
    await plusBtn.click();
    await page.waitForTimeout(2000);

    // Get the newly created project's ID from the active sidebar item
    const activeProject = page.locator('[role="button"]').filter({
      has: page.locator('.bg-violet-500\\/15'),
    }).first();

    // Switch to mindmap — without typing anything
    await page.locator('body').click({ position: { x: 50, y: 300 } });
    await page.keyboard.press('2');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/critic-fix-v3-05-new-mindmap.png', fullPage: true });

    // Check only the mindmap container's SVG (not all SVGs on the page)
    // The mindmap container is the div with ref "containerRef" inside MindMapEditor
    const mindmapContent = await page.evaluate(() => {
      // The mindmap is rendered inside a specific div inside the canvas area
      // Look for the canvas area div that's currently visible
      const canvasArea = document.querySelector('.absolute.inset-0.flex.flex-col');
      if (!canvasArea) return '';
      const svgs = canvasArea.querySelectorAll('svg');
      let text = '';
      svgs.forEach(svg => { text += (svg.textContent || ''); });
      return text;
    });

    console.log(`Mindmap SVG text (first 300): "${mindmapContent.substring(0, 300)}"`);

    // The mindmap for a new project should show "新主题" and no other project content
    const hasUnwantedContent = mindmapContent.includes('智能协作助手') ||
      mindmapContent.includes('竞品分析') ||
      mindmapContent.includes('用户需求');
    const hasRootNode = mindmapContent.includes('新主题') || mindmapContent === '';

    console.log(`Has unwanted old content: ${hasUnwantedContent}`);
    console.log(`Has root "新主题" or empty: ${hasRootNode}`);

    if (hasUnwantedContent) {
      console.log('BUG: new project mindmap shows content from a previous project!');
    }

    expect(hasUnwantedContent).toBeFalsy();
  });

  // ─── Check 3: AI chat + search ───────────────────────────────────────────
  test('检查 3：AI 对话 + 搜索', async ({ page }) => {
    test.setTimeout(90000);

    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');

    const plusBtn = page.locator('button[title="新建项目"]').first();
    await plusBtn.click();
    await page.waitForTimeout(1500);

    // Open AI panel
    await page.keyboard.press('Meta+Slash');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/tmp/critic-fix-v3-06-ai-panel.png', fullPage: true });

    // Verify AI panel
    const aiPanel = page.locator('aside').filter({ hasText: 'AI 助手' });
    const aiPanelVisible = await aiPanel.isVisible().catch(() => false);
    console.log(`AI panel visible: ${aiPanelVisible}`);
    expect(aiPanelVisible).toBeTruthy();

    // Send "你好"
    const chatInput = page.locator('textarea[placeholder*="输入"]').last();
    await chatInput.fill('你好');
    await chatInput.press('Enter');
    // Wait for AI response (up to 15s)
    await page.waitForTimeout(2000);
    let gotReply = false;
    for (let i = 0; i < 6; i++) {
      const body = await page.textContent('body') || '';
      if (body.includes('MeetFlow') || (body.match(/你好[\s\S]{5,}/) && !body.includes('思考中'))) {
        gotReply = true;
        break;
      }
      await page.waitForTimeout(2000);
    }
    await page.screenshot({ path: '/tmp/critic-fix-v3-07-ai-reply.png', fullPage: true });
    console.log(`AI replied: ${gotReply}`);
    expect(gotReply).toBeTruthy();

    // Search tab
    const searchTab = page.locator('[role="tab"]').filter({ hasText: '搜索' });
    await searchTab.click();
    await page.waitForTimeout(500);

    const searchInput = page.locator('textarea[placeholder*="搜索"]');
    await searchInput.fill('产品管理工具');
    await searchInput.press('Enter');
    await page.waitForTimeout(8000);
    await page.screenshot({ path: '/tmp/critic-fix-v3-08-search.png', fullPage: true });

    const bodySearch = await page.textContent('body') || '';
    const hasSearchResponse = bodySearch.includes('产品') || bodySearch.includes('搜索服务') || bodySearch.includes('未找到');
    console.log(`Search has response: ${hasSearchResponse}`);
    expect(hasSearchResponse).toBeTruthy();
  });

  // ─── Check 4: Voice recording with microphone permission ─────────────────
  test('检查 4：语音录制（麦克风权限）', async ({ browser }) => {
    test.setTimeout(30000);

    // Create new context with microphone permission granted
    const context = await browser.newContext({
      permissions: ['microphone'],
    });
    const page = await context.newPage();

    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // Check ASR proxy status
    let asrProxyStatus = 'unknown';
    try {
      const res = await page.request.get('http://localhost:4928');
      asrProxyStatus = String(res.status());
    } catch {
      asrProxyStatus = 'unreachable';
    }
    console.log(`ASR proxy (4928): ${asrProxyStatus}`);

    // Check /api/asr config
    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');

    const asrApiRes = await page.request.get('http://localhost:4927/api/asr');
    let asrConfig: any = {};
    try { asrConfig = await asrApiRes.json(); } catch {}
    console.log(`/api/asr config: ${JSON.stringify(asrConfig)}`);

    // Open/create project
    const plusBtn = page.locator('button[title="新建项目"]').first();
    await plusBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/tmp/critic-fix-v3-09-before-record.png', fullPage: true });

    // Click record button
    const startBtn = page.locator('button').filter({ hasText: '开始录制' });
    await expect(startBtn).toBeVisible({ timeout: 5000 });
    await startBtn.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/critic-fix-v3-10-after-record.png', fullPage: true });

    const bodyText = await page.textContent('body') || '';
    const isRecording = bodyText.includes('停止录制');
    const hasTimer = /\d\d:\d\d:\d\d/.test(bodyText);
    const hasAsrError = bodyText.includes('语音识别');
    const hasMicError = bodyText.includes('麦克风');

    console.log(`Recording active: ${isRecording}`);
    console.log(`Timer visible: ${hasTimer}`);
    console.log(`ASR error: ${hasAsrError}`);
    console.log(`Mic error: ${hasMicError}`);
    console.log(`Console errors: ${consoleErrors.join('; ') || 'none'}`);

    if (isRecording) {
      console.log('Recording started successfully');
      // Check for ASR connection error (expected if ASR proxy not fully running)
      if (hasAsrError) {
        const asrMsg = bodyText.match(/(语音识别[^。\n]*)/)?.[0] || '';
        console.log(`ASR status: "${asrMsg}" — recording continues without ASR`);
      } else {
        console.log('ASR connected (no error shown) — full recording with transcription');
      }
      // Stop it
      const stopBtn = page.locator('button').filter({ hasText: '停止录制' });
      await stopBtn.click();
    } else {
      console.log('BUG: recording button did not activate even with microphone permission granted');
      if (hasMicError) {
        console.log('BUG: mic permission denied despite grantPermissions');
      }
    }

    expect(isRecording).toBeTruthy();
    await context.close();
  });

});
