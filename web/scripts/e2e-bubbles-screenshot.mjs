#!/usr/bin/env node
/**
 * 用 Chromium fake-audio + WAV 文件喂麦克风，跑完整录音流程并截图实时字幕气泡。
 *
 * 前提：
 *   - dev server 在 4927 跑
 *   - asr-proxy 在 4928 跑
 *   - voiceprint 在 4929 跑
 *   - /tmp/test_speech.wav 是 16kHz mono PCM s16 WAV
 */

import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const WAV_PATH = '/tmp/test_speech.wav';
const OUT_DIR = path.resolve(process.cwd(), '../');  // 项目根放截图

if (!fs.existsSync(WAV_PATH)) {
  console.error(`❌ 缺 ${WAV_PATH}，先跑 npm run test:asr 自动生成`);
  process.exit(1);
}

const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${WAV_PATH}`,
    '--autoplay-policy=no-user-gesture-required',
  ],
});

const context = await browser.newContext({
  permissions: ['microphone'],
});
const page = await context.newPage();

// 监听 console
const asrEvents = [];
const allEvents = [];
page.on('console', (msg) => {
  const t = msg.text();
  if (t.includes('[ASR]')) asrEvents.push(t);
  if (t.includes('[writeLive]') || t.includes('[.text branch]') || t.includes('[render]') || msg.type() === 'error') {
    allEvents.push(`[${msg.type()}] ${t}`);
  }
});
page.on('pageerror', (e) => allEvents.push(`[pageerror] ${e.message}`));

console.log('1. 打开录音页…');
await page.goto('http://localhost:4927/', { waitUntil: 'networkidle' });
await page.screenshot({ path: path.join(OUT_DIR, 'proof-1-home.png') });

console.log('2. 点开始录音…');
await page.click('button:has-text("开始录音")');
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(OUT_DIR, 'proof-2-recording-started.png') });

// fake audio 文件 ≈11 秒。每 2 秒截一次看气泡变化
for (let i = 1; i <= 6; i++) {
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT_DIR, `proof-3-bubbles-${i*2}s.png`) });
  console.log(`   t=${i*2}s 截图, ASR 事件累计 ${asrEvents.length}`);
}

// 看 DOM：lines 渲染的 div 数量
const bubbleCount = await page.locator('div.space-y-2 > div').count();
console.log(`\nDOM 中 bubble div 数量: ${bubbleCount}`);
const allText = await page.locator('div.space-y-2').first().innerText().catch(() => '<empty>');
console.log(`div.space-y-2 innerText: ${allText.slice(0, 200)}`);

console.log('3. 停止录音…');
await page.click('button:has-text("停止录音")');
await page.waitForTimeout(2000);
await page.screenshot({ path: path.join(OUT_DIR, 'proof-4-stopped.png'), fullPage: true });

console.log('\n=== ASR 浏览器 console 事件 (前 30 条) ===');
asrEvents.slice(0, 30).forEach((e) => console.log(' ', e.slice(0, 150)));
console.log(`\n总 ${asrEvents.length} 条 [ASR] 事件`);
console.log('\n=== 调试/错误 console ===');
allEvents.slice(0, 30).forEach((e) => console.log(' ', e.slice(0, 200)));

await browser.close();
process.exit(0);
