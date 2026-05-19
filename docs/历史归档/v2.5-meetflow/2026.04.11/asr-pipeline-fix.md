# 2026-04-11 ASR 语音识别管线修复

状态: 已完成 / E2E 真实音频 + 浏览器 Playwright 点击 + 持久化回归测试全部通过

## 问题

用户反馈:"语音功能他妈一直用不了,从来都没有成功用过,语音识别断开,5秒后自动重连 (2/3)..."

调查后确认:**v2.3 之前提交的 ASR 代码从未真正端到端跑通过**。前端显示的 "自动重连" 只是把"从没连通过"包装成了"看起来在重试"的假象。

## 根因 (三个独立 bug 叠加)

### Bug 1 — asr-proxy 把 TEXT 帧转成了 BINARY 帧
`web/src/asr-proxy.ts`:

```ts
client.on('message', (data) => {
  upstream.send(data);  // ❌ data 是 Buffer → ws.send 默认 BINARY 帧
});
```

`ws` 库拿到字符串用 `ws.on('message')` 回调时,`data` 是 Buffer。再 `upstream.send(buf)` 默认发成 BINARY 帧。DashScope 看到 binary 帧的 JSON 控制消息,立刻用 `1011 Internal server error` 关闭连接。

**表现**: session.created 后 ~20ms 就关闭 → 前端看到 `onclose` → 重连 → 再关闭。

**修复**: `client.on('message', (data, isBinary) => upstream.send(data, { binary: isBinary }))`。同时给反向 `upstream → client` 加上一样的处理,并加一个 pending buffer 解决 upstream 还没 open 时丢弃消息的竞态。

### Bug 2 — DashScope 模型必须用 URL query 参数传,不是 session.update
```
wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-asr-flash-realtime
```

如果 URL 里不带 model,服务端默认用 `qwen-omni-turbo-realtime-*`(错的模型),然后用 `1007 Model not found` 关闭。

session.update 里的 `model` 字段会被忽略。

### Bug 3 — 事件名完全搞错(OpenAI vs DashScope)
`VoicePanel.tsx` 在监听 OpenAI Realtime API 的 `response.audio_transcript.delta`——但 **DashScope Qwen3-ASR 根本不发这个事件**。它发的是:

- `conversation.item.input_audio_transcription.text` (流式,字段 `text` + `stash`)
- `conversation.item.input_audio_transcription.completed` (最终,字段 `transcript`)

所以即使前两个 bug 没有,前端收到流式文字也不会显示任何东西。

另外:`input_audio_format` 必须是 `"pcm"` 不是 `"pcm16"`——DashScope 用后者会报 `"Audio format is not valid 'pcm16'!"` 然后 `1011` 关闭。

## 修复

| 文件 | 改动 |
|---|---|
| `web/src/asr-proxy.ts` | URL 加 `?model=qwen3-asr-flash-realtime`;双向转发时保留 `isBinary` 帧类型;加 pending buffer;日志输出到 `web/logs/asr-proxy.log` |
| `web/src/components/voice/VoicePanel.tsx` | session.update 用 DashScope 协议(`pcm` / sample_rate 16000 / language zh / threshold 0.0);监听 `conversation.item.input_audio_transcription.text` (text + stash) 做流式显示;**新增项目 transcripts hydration**(useEffect on currentProjectId);**startRecording 不再 reset transcripts**,第二次录制 append 到之前的记录 |
| `web/tests/asr-proxy.e2e.mjs` | 新增 — 用真实中文音频跑完整管线,检查最终 transcript 包含关键词 |
| `web/tests/fixtures/asr_test_zh.pcm` | 新增 — 8 秒中文 PCM16 16kHz 测试音频(由 macOS `say -v Tingting` 生成) |

## Bug 修复: 重新录制丢失历史记录

**症状**: 在同一个项目里,第一次录制→停止→再次点击录制,之前的 transcripts 从 UI 和 project 文件里全部消失。

**根因**:
1. VoicePanel 组件挂载时用 `useState<TranscriptItem[]>([])` 初始化,**从不读 `currentProject.transcripts`**,所以翻到已有数据的项目时画面是空的(但 project 文件里其实有)
2. `startRecording` 第一句就是 `setTranscripts([])` + `workspace.setTranscripts([])`,第二次点录制直接把 UI 清空
3. 随后 `stopRecording` 的 `saveField("transcripts", prev)` 把清空后(只含新 session)的 transcripts 写回 project 文件,**历史数据被从磁盘上覆盖**

**修复**:
1. 加 `useEffect` 监听 `currentProjectId`,项目切换时从 `currentProject.transcripts` hydrate 到本地 state + workspace,同时把 `transcriptIdRef` 推到 max(existing)+1 避免 id 冲突
2. 删掉 `startRecording` 里的 `setTranscripts([])`,改成只更新 transcriptIdRef,新 session 追加到已有记录后面
3. 加守卫 `if (isRecording) return;` 防止 project 数据刷新中途覆盖 live 状态

**回归测试**: `/tmp/asr-persist-test.mjs`(Playwright)种 3 条历史记录 → reload → 点录制 → 点停止 → 验证 DOM 和 project 文件里都还有 3 条。PASS。

## 验证

真实音频: "今天我们开一个项目讨论会议,主要议程包括产品方向、技术选型和时间安排。"

```
$ cd web && node tests/asr-proxy.e2e.mjs
[config] ws://localhost:4928 model=qwen3-asr-flash-realtime
[ws] connected to proxy
[ws] session.updated
[audio] 257630 bytes, 81 chunks @ 100ms

=== RESULT ===
events: [
  session.created, session.updated,
  input_audio_buffer.speech_started,
  conversation.item.created,
  conversation.item.input_audio_transcription.text,
  input_audio_buffer.speech_stopped,
  input_audio_buffer.committed,
  conversation.item.input_audio_transcription.completed,
  session.finished
]
transcripts: [
  '今天我们开一个项目讨论会议。',
  '主要议程包括产品方向。',
  '技术选型和时间安排。'
]

✅ PASS — ASR pipeline is working end-to-end
```

VAD 把原句按自然停顿切成 3 段,每段都逐字正确。

## 运行要求

两个进程必须同时跑:

```bash
cd web && npm run dev         # 端口 4927
cd web && npm run asr-proxy   # 端口 4928 (桥到 DashScope)
```

任何一个缺失,浏览器开始录制都会立即掉线。

## 经验教训

1. **"自动重连"是掩盖"从没连通过"的烟雾弹** — 下次看到死循环重连,先怀疑首连从没成功过,而不是网络抖动。
2. **WebSocket 代理必须保留帧类型** — 用 `ws` 库写 proxy 时 TEXT/BINARY 帧必须显式透传,不然 JSON 控制消息会被服务端拒收。
3. **第三方 API 的协议事件名不能想当然** — 即使两个厂商都实现了"OpenAI Realtime API",DashScope 用的是它自己的事件名。必须看厂商文档,不能按 OpenAI 协议复制粘贴。
4. **E2E 测试必须用真实音频跑真实后端** — 看 build 过、看 TypeScript 过、看 UI 渲染过,都不等于语音识别能用。只有 "给它真实中文音频 → 拿到中文 transcript" 才算通过。
