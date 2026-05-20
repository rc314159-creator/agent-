#!/usr/bin/env node
/**
 * 端到端 ASR 测试：用 TTS 生成的中文 WAV 灌进 asr-proxy (4928)，
 * 验证 DashScope 是否返回实时 .text 增量字幕 + 最终 .completed。
 *
 * 用法：
 *   1) 先确保 asr-proxy 在跑：cd web && npm run asr-proxy
 *   2) 跑测试：cd web && npm run test:asr
 *
 * 如果看到 [evt] conversation.item.input_audio_transcription.text 不断滚动
 * + 后续 .completed transcript=".." → ASR 链路工作正常。
 */

import WebSocket from 'ws';
import fs from 'fs';
import { execSync } from 'child_process';
import os from 'os';
import path from 'path';

const PROXY_URL = process.env.ASR_PROXY_URL ?? 'ws://localhost:4928';

// 1. 生成中文 TTS WAV（如缺）
const WAV_PATH = path.join(os.tmpdir(), 'asr_e2e_test.wav');
if (!fs.existsSync(WAV_PATH)) {
  console.log('[test] generating TTS WAV...');
  const text = '你好，今天我们开个测试会议。这是第一句话。这是第二句话。';
  const aiff = path.join(os.tmpdir(), 'asr_e2e_test.aiff');
  try {
    execSync(`say -v Tingting "${text}" -o ${aiff}`, { stdio: 'inherit' });
    execSync(`ffmpeg -y -i ${aiff} -ar 16000 -ac 1 -sample_fmt s16 ${WAV_PATH}`, { stdio: 'inherit' });
  } catch (e) {
    console.error('需要 macOS `say` + `ffmpeg`，或者手动放一个 16kHz mono PCM s16 WAV 到', WAV_PATH);
    process.exit(1);
  }
}

const wavBuf = fs.readFileSync(WAV_PATH);
const pcmBuf = wavBuf.subarray(44); // skip RIFF header
console.log(`[test] WAV ${wavBuf.length} bytes, PCM ${pcmBuf.length} bytes (≈${(pcmBuf.length/32000).toFixed(2)}s @16kHz mono)`);
console.log(`[test] connecting to ${PROXY_URL}...`);

const ws = new WebSocket(PROXY_URL);
let textEvents = 0;
let completedEvents = 0;
const finalTranscripts = [];

ws.on('open', () => {
  console.log('[test] WS open');
  ws.send(JSON.stringify({
    type: 'session.update',
    session: {
      input_audio_format: 'pcm',
      sample_rate: 16000,
      input_audio_transcription: { language: 'zh' },
      turn_detection: { type: 'server_vad', threshold: 0.0, silence_duration_ms: 400 },
    },
  }));

  const CHUNK_BYTES = 3200; // 100ms @ 16kHz mono int16
  let offset = 0;
  let chunkIdx = 0;
  const startTime = Date.now();
  const interval = setInterval(() => {
    if (offset >= pcmBuf.length) {
      clearInterval(interval);
      console.log(`[test] sent ${chunkIdx} chunks in ${Date.now()-startTime}ms, waiting 8s for final events...`);
      setTimeout(() => ws.close(), 8000);
      return;
    }
    const chunk = pcmBuf.subarray(offset, Math.min(offset + CHUNK_BYTES, pcmBuf.length));
    ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: chunk.toString('base64') }));
    offset += CHUNK_BYTES;
    chunkIdx++;
  }, 100);
});

ws.on('message', (data) => {
  const raw = data.toString();
  if (raw.length < 4096) {
    try {
      const msg = JSON.parse(raw);
      const t = msg.type;
      if (t === 'conversation.item.input_audio_transcription.text') {
        textEvents++;
        if (textEvents <= 5) console.log(`[evt RAW .text #${textEvents}]:`, JSON.stringify(msg));
      } else if (t === 'conversation.item.input_audio_transcription.completed') {
        completedEvents++;
        const transcript = msg.transcript ?? '';
        finalTranscripts.push(transcript);
        console.log(`[evt] .completed #${completedEvents}: "${transcript}"`);
      } else if (t === 'error') {
        console.error(`[evt] ERROR:`, msg.error);
      } else if (!t?.startsWith('input_audio_buffer') && !t?.startsWith('conversation.item.created')) {
        console.log(`[evt] ${t}`);
      }
    } catch {}
  }
});

ws.on('close', () => {
  console.log('\n=== 测试报告 ===');
  console.log(`.text 实时增量事件:    ${textEvents} 次`);
  console.log(`.completed 最终事件:   ${completedEvents} 次`);
  console.log(`识别结果:`);
  finalTranscripts.forEach((t, i) => console.log(`  ${i+1}. "${t}"`));
  const pass = textEvents > 0 && completedEvents > 0;
  console.log(`\n${pass ? '✅ PASS' : '❌ FAIL'}: ASR 实时字幕${pass ? '工作正常' : '未触发 — 见上面错误日志'}`);
  process.exit(pass ? 0 : 1);
});

ws.on('error', (e) => {
  console.error('[test] WS error:', e.message);
  console.error('确认 asr-proxy 在跑：cd web && npm run asr-proxy');
  process.exit(1);
});
