# 2026-04-11 说话人分离(Speaker Diarization)

状态: 已完成 / 真实多说话人 Playwright E2E 通过(2 speakers 识别正确)

## 需求

用户反馈 Qwen3-ASR-Flash-Realtime 不支持说话人分离,而群面记录最关键的能力就是"知道每一段话是谁说的"。10 人依次发言的场景下必须能自动识别并分段。

## 调研结论

国内外主流方案逐个核实后:

| 方案 | 中文 | 流式+Diarization 同开 | 结论 |
|---|---|---|---|
| **DashScope Paraformer-v2 录音文件识别** (离线+post) | ✅ | N/A (文件模式) | ✅ 采用 — 同一 API key |
| 火山引擎豆包大模型流式 ASR | ✅ | ✅ `enable_speaker_info` | 可用但需新账号 + 按并发月付 ¥500-1500 |
| Azure Conversation Transcriber | ✅ | ✅ | 可用但需跨境 Azure 订阅 |
| Deepgram Streaming | ✅ 但 broken | 号称支持,实际所有 speaker 都是 0 | ❌ |
| AssemblyAI | ❌ 无中文流式 | — | ❌ |
| 讯飞 RTASR | ✅ | ❌ | ❌ |
| 腾讯云实时 ASR | ✅ | ❌ | ❌ |
| FunASR / WhisperX 开源 | ✅ | streaming+diarize 只有 offline 组合 | ⚠️ 工程量大 |

**结论**: 商业方案里 "中文+流式+diarization 同开" 只有**火山豆包大模型**一家(月付)和 **Azure Conversation Transcriber** 一家(海外)。性价比最高的是 **DashScope Paraformer-v2 录音文件识别** post-processing,同一个 API key 无额外成本。

## 架构: 混合管线

```
┌─────────── 录音进行中 ────────────────┐
│  Mic → WebSocket → Qwen3-ASR-Flash     │
│            ↓                           │
│  实时字幕 (一个灰色"讲话中"气泡        │
│    所有文本累积,不拆分,不假装知道     │
│    谁在说话)                           │
│                                        │
│  同时 PCM buffer 积累在前端内存        │
└────────────────────────────────────────┘
            ↓ 点击 "停止录制"
┌─────────── Post-processing ───────────┐
│  Float32 PCM → resample 16kHz Int16   │
│    → WAV (RIFF/WAVE 44B header)        │
│    → POST /api/asr-diarize              │
│    → DashScope uploads API (临时 OSS)   │
│    → /services/audio/asr/transcription  │
│      model=paraformer-v2                │
│      diarization_enabled=true           │
│      speaker_count=10                   │
│    → 轮询 tasks API until SUCCEEDED    │
│    → 拿 transcription_url 的 JSON       │
│    → 按 speaker_id 合并同说话人连续句  │
│    → 返回 [{speaker_id, text, time}]    │
│                                        │
│  前端: setTranscripts(merged)          │
│    灰色"讲话中"气泡被多色 speaker 气泡  │
│    覆盖;历史记录保留                   │
└────────────────────────────────────────┘
```

## 验证过的事实

### DashScope Paraformer-v2 录音文件识别

- **参数**: `diarization_enabled: true`, `speaker_count: 2-100`
- **响应**: `sentences[]` 每条带 `speaker_id` (整数,从 0 起)
- **最长音频**: 12 小时
- **合成 TTS 声音太相似,不能做声纹区分测试**(验证过 macOS `say` 的不同 voice 还是 speaker_id=0)
- **真实人声区分准确**(F+M+F+M 的 DashScope 官方样本,正确识别为交替的 speaker 1 和 2)
- **费用**: 比实时 ASR 便宜,按时长计费
- **异步 API**: 需要 `X-DashScope-Async: enable`,轮询 /api/v1/tasks/{task_id}

### DashScope 临时上传

- **端点**: `GET /api/v1/uploads?action=getPolicy&model=paraformer-v2`
- **流程**: 拿 policy → POST multipart 到 upload_host → 得到 `key` → 构造 `oss://{key}`
- **使用**: 后续 API 调用需加 header `X-DashScope-OssResourceResolve: enable`
- **有效期**: 上传凭证 300 秒,文件 48 小时
- **成本**: 免费

## 文件改动

| 文件 | 改动 |
|---|---|
| `web/src/app/api/asr-diarize/route.ts` | 新增 — POST 接收 WAV → 上传 DashScope 临时 OSS → 提交 Paraformer-v2 任务 → 轮询 → 解析 → 返回带 speaker 的分段。全程 pino 日志 |
| `web/src/components/voice/VoicePanel.tsx` | 录音时同步 buffer Float32 PCM;stop 后 resample + 打包 WAV + POST /api/asr-diarize;用返回结果覆盖 live 气泡;10 色 SPEAKER_COLOR_POOL;live 显示改成单气泡"讲话中"不拆分;transcriptsRef 避免 setState-in-render 警告 |
| `web/src/components/voice/VoicePanel.tsx` (effect) | 加 useEffect 把 transcripts 同步到 workspace context,避免 setState-in-render warning |
| `web/tests/asr-diarize.e2e.mjs` | 新增 — Playwright 驱动真实浏览器点录制按钮,用系统麦克风捕获音频,等 diarization,断言 DOM 里至少有一个 `说话人 N` badge |

## Bug 修复一并纳入本次

### live 气泡被拆分(用户反馈)

**症状**: 一个人连续说话,中间 VAD 每次检测到停顿就新开一个气泡,视觉上像是换了说话人。

**根因**: 旧代码在 `input_audio_buffer.speech_started` 事件里 `speakerIndexRef = (speakerIndexRef + 1) % 4` 并 reset currentStreamingRef。

**修复**: 移除 speaker 旋转,live 阶段累积所有文本到单个 `讲话中` 气泡,直到 stop。

### setState-in-render 警告(stopping 测试)

**症状**: Next 15 / React 19 dev overlay 弹出 `Cannot update a component (WorkspaceProvider/ProjectProvider) while rendering a different component (VoicePanel)`,overlay 挡住 UI 让 Playwright 点不到按钮。

**根因**: 在 setTranscripts 的 updater 函数里调 workspace.setTranscripts / saveField,后者内部又调 setCurrentProject → 跨组件 setState in render。

**修复**:
1. 新增 `transcriptsRef` 始终持有最新 transcripts,不需要把 transcripts 塞 useCallback 依赖
2. `useEffect([transcripts])` 把 transcripts 镜像到 workspace context + 更新 ref,把跨组件 setState 推后到 commit 后
3. 所有 updater 只做纯函数计算,副作用(saveField)都移到 updater 外面

### 合并连续同说话人

**症状**: 同一人 30 秒的 monologue 被切成 2 个气泡(因为 Paraformer 按句返回,句间停顿 >1500ms)。

**修复**: 后端 `buildSegments` 改成"同 speaker 就合并",不设时间阈值。换人才新开段。

## E2E 验证

### 真实人声(DashScope 官方样本 F+M+F+M 交替)

```
$ curl -s -X POST "http://localhost:4927/api/asr-diarize?speakerCount=2" \
    -H "Content-Type: audio/wav" --data-binary @/tmp/ds_multi.wav
  说话人 1: Hello world 这里是阿里巴巴语音。        (female)
  说话人 2: 实验室 hello world,这里是阿里巴巴语音实验室。  (male)
  说话人 1: hello world, 这里是阿里巴巴语音。        (female - correctly re-identified)
  说话人 2: 实验室。Hello world, ...                (male - correctly re-identified)
```
Paraformer 正确地把两次出现的女声归为 speaker 1,两次男声归为 speaker 2。

### 真实多人对话(Playwright + 用户播放系统音频,30 秒)

```
[说话人 1] 呃,粗粗的就感觉不到你中间的每一个地方,这些细节其实是你的步骤...我觉得这个我们可能还得换一种这个做图的方式啊,你觉得呢?
[说话人 2] 呃呃我觉得也可以吧就是。
```

2 个不同说话人被正确识别并分段;同说话人的连续发言合并到一个气泡;无 React 警告;diarization 3 秒完成。

## 运行

```bash
cd web
npm run dev          # 4927
npm run asr-proxy    # 4928 (桥到 DashScope 实时 WS)
# 浏览器: http://localhost:4927
# 或 headless 测试:
node tests/asr-proxy.e2e.mjs    # 实时 ASR 基础测试
node tests/asr-diarize.e2e.mjs  # Diarization E2E (需要系统放一段真实多人音频)
```
