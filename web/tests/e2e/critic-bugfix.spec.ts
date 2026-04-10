import { test, expect } from '@playwright/test';
import * as path from 'path';

/**
 * Critic Bug-Fix E2E Suite
 * Focus: find real bugs in the current codebase state.
 */

test.describe('Critic E2E — Bug Hunt', () => {

  // ─── Scenario 1: Full recording task flow ───────────────────────────────
  test('场景 1：完整记录任务流程', async ({ page }) => {
    test.setTimeout(90000);

    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => consoleErrors.push('[pageerror] ' + err.message));

    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: '/tmp/critic-fix-01-homepage.png', fullPage: true });

    // Step 1: Create new project
    const plusBtn = page.locator('button[title="新建项目"]').first();
    await expect(plusBtn).toBeVisible({ timeout: 5000 });
    await plusBtn.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/critic-fix-02-new-project.png', fullPage: true });

    // Step 2: Type content in outline
    const editor = page.locator('[contenteditable="true"]').first();
    await expect(editor).toBeVisible({ timeout: 5000 });
    await editor.click();
    // Clear any existing content
    await page.keyboard.press('Meta+a');
    await page.waitForTimeout(200);
    await page.keyboard.type('用户需求分析', { delay: 50 });
    await page.waitForTimeout(500);
    const outlineContent1 = await editor.innerText();
    await page.screenshot({ path: '/tmp/critic-fix-03-typed-content.png', fullPage: true });
    console.log(`Outline content after typing: "${outlineContent1}"`);

    // Step 3: Press key "2" to switch to mindmap — should be blank
    // First click outside the editor so keyboard shortcut registers
    await page.locator('body').click({ position: { x: 100, y: 100 } });
    await page.waitForTimeout(200);
    await page.keyboard.press('2');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/tmp/critic-fix-04-mindmap-view.png', fullPage: true });

    // Check if mindmap is blank (should not show outline content)
    const mindmapLabel = page.locator('text=导图').first();
    const mindmapTab = page.locator('span').filter({ hasText: '导图' });
    const bodyText3 = await page.textContent('body') || '';
    const mindmapIsBlank = !bodyText3.includes('用户需求分析');
    console.log(`Step 3 — mindmap blank (no outline content): ${mindmapIsBlank}`);
    if (!mindmapIsBlank) {
      console.log('BUG: mindmap shows outline content when it should be blank');
    }

    // Step 4: Press key "1" to switch back to outline — content must still be there
    await page.keyboard.press('1');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/tmp/critic-fix-05-back-to-outline.png', fullPage: true });

    const editorAfterSwitch = page.locator('[contenteditable="true"]').first();
    const outlineContentAfter = await editorAfterSwitch.innerText().catch(() => '');
    console.log(`Step 4 — outline content after switch: "${outlineContentAfter}"`);

    const contentPreserved = outlineContentAfter.includes('用户需求分析');
    if (!contentPreserved) {
      console.log('BUG: outline content was cleared after switching to mindmap and back!');
    }

    // Step 5: Open AI assistant (Cmd+/)
    await page.keyboard.press('Meta+Slash');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/critic-fix-06-ai-panel.png', fullPage: true });

    const aiChatPanel = page.locator('aside, [role="complementary"]').filter({ hasText: /AI|助手|对话|聊天/ });
    const aiPanelVisible = await aiChatPanel.isVisible().catch(() => false);
    console.log(`Step 5 — AI panel visible: ${aiPanelVisible}`);

    if (aiPanelVisible) {
      // Send "你好"
      const chatInput = page.locator('textarea').last();
      const inputVisible = await chatInput.isVisible().catch(() => false);
      if (inputVisible) {
        await chatInput.fill('你好');
        await chatInput.press('Enter');
        await page.waitForTimeout(8000);
        await page.screenshot({ path: '/tmp/critic-fix-07-ai-replied.png', fullPage: true });

        const aiBodyText = await page.textContent('body') || '';
        const hasAIReply = aiBodyText.includes('你好') || aiBodyText.includes('帮') || aiBodyText.includes('MeetFlow');
        console.log(`Step 5 — AI replied: ${hasAIReply}`);
        if (!hasAIReply) {
          console.log('BUG: AI did not reply to "你好"');
        }
      } else {
        console.log('BUG: AI chat input not visible after Cmd+/');
      }
    } else {
      console.log('BUG: AI panel did not open with Cmd+/');
    }

    // Step 6: Check if there's a search tab / trigger search
    // Close AI panel first
    await page.keyboard.press('Meta+Slash');
    await page.waitForTimeout(500);

    // Look for search functionality in AI panel
    await page.keyboard.press('Meta+Slash');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/tmp/critic-fix-08-search-tab.png', fullPage: true });
    const searchTab = page.locator('button, [role="tab"]').filter({ hasText: /搜索|Search/ });
    const searchTabCount = await searchTab.count();
    console.log(`Step 6 — search tab count: ${searchTabCount}`);

    // Check console errors
    console.log(`Console errors: ${consoleErrors.length > 0 ? consoleErrors.join('\n') : 'none'}`);

    await page.screenshot({ path: '/tmp/critic-fix-09-final.png', fullPage: true });

    // Assert the critical item: outline content preserved
    if (!contentPreserved) {
      throw new Error('BUG: Outline content was cleared when switching to mindmap and back!');
    }
  });

  // ─── Scenario 2: Voice recording ────────────────────────────────────────
  test('场景 2：语音录制', async ({ page }) => {
    test.setTimeout(30000);

    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');

    // Pick first project or create one
    const projectBtns = page.locator('[role="button"]').filter({ hasText: /项目|分析|讨论|新项目/ });
    const pCount = await projectBtns.count();
    if (pCount > 0) {
      await projectBtns.first().click();
    } else {
      const plusBtn = page.locator('button[title="新建项目"]').first();
      await plusBtn.click();
    }
    await page.waitForTimeout(1500);

    // Check voice panel is visible
    const voicePanel = page.locator('aside').filter({ hasText: '语音录制' });
    const voicePanelVisible = await voicePanel.isVisible().catch(() => false);
    console.log(`Voice panel visible: ${voicePanelVisible}`);
    await page.screenshot({ path: '/tmp/critic-fix-10-voice-panel.png', fullPage: true });

    if (voicePanelVisible) {
      // Click "开始录制" button
      const startBtn = page.locator('button').filter({ hasText: '开始录制' });
      const startBtnVisible = await startBtn.isVisible().catch(() => false);
      console.log(`"开始录制" button visible: ${startBtnVisible}`);

      if (startBtnVisible) {
        // Note: In test environment, getUserMedia will likely fail or be mocked
        await startBtn.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: '/tmp/critic-fix-11-recording-started.png', fullPage: true });

        // Check if recording started (button should become "停止录制")
        const stopBtn = page.locator('button').filter({ hasText: '停止录制' });
        const isRecording = await stopBtn.isVisible().catch(() => false);
        console.log(`Recording started (shows "停止录制"): ${isRecording}`);

        // Check for ASR error message
        const asrError = page.locator('text=语音识别连接失败, text=麦克风权限被拒绝, text=ASR');
        const asrErrorText = await page.textContent('body') || '';
        const hasAsrError = asrErrorText.includes('语音识别') || asrErrorText.includes('ASR') || asrErrorText.includes('麦克风');
        console.log(`ASR error present: ${hasAsrError}`);
        if (hasAsrError) {
          console.log('BUG (expected in test env): ASR error shown — ' + (asrErrorText.match(/(语音识别[^，。\n]*|ASR[^，。\n]*|麦克风[^，。\n]*)/)?.[0] || ''));
        }

        if (isRecording) {
          // Stop recording
          await stopBtn.click();
          await page.waitForTimeout(1000);
        }
      } else {
        console.log('BUG: "开始录制" button not visible in voice panel');
      }
    } else {
      console.log('BUG: Voice panel not visible after selecting project');
    }

    console.log(`Console errors: ${consoleErrors.length > 0 ? consoleErrors.join('\n') : 'none'}`);
    await page.screenshot({ path: '/tmp/critic-fix-12-voice-final.png', fullPage: true });
  });

  // ─── Scenario 3: Multi-project switching ────────────────────────────────
  test('场景 3：多项目切换', async ({ page }) => {
    test.setTimeout(60000);

    await page.goto('http://localhost:4927');
    await page.waitForLoadState('networkidle');

    const plusBtn = page.locator('button[title="新建项目"]').first();

    // Create Project A
    await plusBtn.click();
    await page.waitForTimeout(2000);
    const editorA = page.locator('[contenteditable="true"]').first();
    await editorA.click();
    await page.keyboard.press('Meta+a');
    await page.waitForTimeout(100);
    await page.keyboard.type('项目A内容-唯一标识XYZ123', { delay: 30 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/tmp/critic-fix-13-project-a.png', fullPage: true });
    const contentA = await editorA.innerText();
    console.log(`Project A content typed: "${contentA}"`);

    // Create Project B
    await plusBtn.click();
    await page.waitForTimeout(2000);
    const editorB = page.locator('[contenteditable="true"]').first();
    await editorB.click();
    await page.keyboard.press('Meta+a');
    await page.waitForTimeout(100);
    await page.keyboard.type('项目B内容-唯一标识ABC456', { delay: 30 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/tmp/critic-fix-14-project-b.png', fullPage: true });
    const contentB = await editorB.innerText();
    console.log(`Project B content typed: "${contentB}"`);

    // Switch back to Project A (the project before B in the list)
    // Wait for projects to appear in list
    await page.waitForTimeout(500);
    const projectItems = page.locator('[role="button"]');
    const projectCount = await projectItems.count();
    console.log(`Project items in list: ${projectCount}`);

    // Find a project button that's NOT the current one (should be project A)
    // Project A was created first so it should appear higher or lower in the list
    // The current project B is active — look for a different button in project panel
    const projectPanel = page.locator('aside').first();
    const projectButtons = projectPanel.locator('[role="button"]');
    const btnCount = await projectButtons.count();
    console.log(`Buttons in project panel: ${btnCount}`);

    // Find button containing "新项目" (the one that is not currently active)
    // or find by timestamp — just click the second-to-last one
    if (btnCount >= 2) {
      // Click second button (index 1) — likely Project A
      await projectButtons.nth(btnCount - 2).click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: '/tmp/critic-fix-15-switched-to-a.png', fullPage: true });

      const editorAfterSwitchA = page.locator('[contenteditable="true"]').first();
      const contentAfterSwitchA = await editorAfterSwitchA.innerText().catch(() => '');
      console.log(`After switching to Project A: "${contentAfterSwitchA}"`);

      const hasProjectAContent = contentAfterSwitchA.includes('XYZ123');
      console.log(`Project A content preserved: ${hasProjectAContent}`);
      if (!hasProjectAContent) {
        console.log('BUG: Project A content not preserved after switching to Project B and back!');
        console.log(`Expected "XYZ123" in content, got: "${contentAfterSwitchA}"`);
      }

      // Switch back to Project B
      await projectButtons.nth(btnCount - 1).click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: '/tmp/critic-fix-16-switched-to-b.png', fullPage: true });

      const editorAfterSwitchB = page.locator('[contenteditable="true"]').first();
      const contentAfterSwitchB = await editorAfterSwitchB.innerText().catch(() => '');
      console.log(`After switching to Project B: "${contentAfterSwitchB}"`);

      const hasProjectBContent = contentAfterSwitchB.includes('ABC456');
      console.log(`Project B content preserved: ${hasProjectBContent}`);
      if (!hasProjectBContent) {
        console.log('BUG: Project B content not preserved after multi-project switching!');
      }

      expect(hasProjectAContent).toBeTruthy();
      expect(hasProjectBContent).toBeTruthy();
    } else {
      console.log('BUG: Not enough project buttons to test switching');
      throw new Error('Could not create two projects for switching test');
    }
  });

});
