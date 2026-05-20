# 会议记录工具 — 可进化声纹 MVP

录音 → 实时字幕 → 自动归属到说话人 → 跨会议声纹库越用越准。

## 快速开始

```bash
# 1. 启动声纹服务 (Docker)
docker compose up -d voiceprint-service

# 2. 启动 ASR WebSocket 代理 (新终端)
cd web && npm run asr-proxy

# 3. 启动 Next.js dev (新终端)
cd web && npm run dev

# 4. 浏览器打开
open http://localhost:4927
```

第一次 docker build 会花 5-10 分钟（拉 CPU torch + speechbrain + ECAPA 权重，~2GB 镜像）。

## 页面

| 路径 | 功能 |
|------|------|
| `/` | 录音页. 选通道（麦克风/系统音频/混合）→ 麦克风测试 → 开始录音 → 实时字幕 → 每句归角色 |
| `/voiceprints` | 声纹库. 角色列表, 详情页听样本 / 改名 / 移动 utterance |
| `/meetings` | 历史会议列表 |
| `/meetings/[id]` | 会议详情. 录音中实时追加字幕 (SSE); 结束后可触发 AI 总结 |
| `/settings` | 配置中心. Anthropic API key + 模型 + DashScope key + Agent system prompt |

## R8/R9/R10 新增功能

### R8 — 录音通道选择 + 麦克风测试 + 会议详情实时字幕

- **录音通道**: 开始录音前选择麦克风 / 系统音频 / 混合（WebAudio ChannelMerger）
- **麦克风测试**: 音量计 + 静音 2 秒告警，支持多设备切换
- **实时字幕 SSE**: 录音进行中打开 `/meetings/[id]`，新字幕通过 Server-Sent Events 实时追加

### R9 — AI 会议总结 + 跨会议 memory

- 会议详情页右上角「AI 总结」按钮触发流式分析
- 使用 `@anthropic-ai/claude-agent-sdk` + MCP server 模式
- 4 个工具: 获取会议记录 / 列声纹角色 / 查角色历史 / 全文搜索
- 总结写入 `data/agent-memory/meeting_<id>.md`，下次总结自动加载作为历史记忆
- 支持自定义 system prompt（在 `/settings` 配置）

### R10 — 配置中心 `/settings`

- Anthropic API key + base URL + 模型选择（Opus/Sonnet/Haiku）
- DashScope ASR key（留空则读 `DASHSCOPE_API_KEY` 环境变量）
- Agent system prompt 可编辑
- API key 展示脱敏（首4尾4），保存时只覆盖主动填写的字段
- 「测试连通性」按钮验证 Anthropic API 可达性

---

## 端口分配

| 服务 | 端口 |
|------|------|
| Next.js (UI + API) | 4927 |
| ASR WebSocket Proxy → DashScope Qwen3-ASR | 4928 |
| Voiceprint Service (Docker, 3D-Speaker ECAPA) | 4929 |

## 架构

```
浏览器
  ├─ 录音 → AudioContext → ScriptProcessor
  ├─ 实时 PCM → WebSocket → ASR Proxy → Qwen3-ASR (实时字幕)
  └─ 每句话停顿 (Qwen 的 .completed 事件) → 切对应 PCM 段 →
     POST /api/utterances/ingest
                ↓
        Next.js API:
          save WAV → data/segments/<uuid>.wav
          POST 4929 /embed → 192d float32 embedding
          余弦匹配所有 speaker.centroid:
            ≥ 0.75 → 自动归该 speaker
            0.6~0.75 → 归 + needs_review (autoMode 关时)
            < 0.6 → 新建 "新用户 N"
          recomputeCentroid(speakerId) (重算均值)
                ↓
        前端: 把"归属中..."气泡换成正式角色名
```

## 关键决策

- **声纹模型**: SpeechBrain ECAPA-TDNN (192d 开源, 跨语言通用). 后续可换 3D-Speaker CAM++ 提升中文表现.
- **VAD 信号**: 不用单独 VAD 模型, 直接复用 Qwen3-ASR 的 `.completed` 事件作为切句信号 — ASR 自身已 server_vad, 天然对齐 ASR 文本和 PCM 边界.
- **存储**: SQLite (`data/vp.db`) + 音频片段 (`data/segments/<uuid>.wav`). 每条 utterance 保留 raw_embedding 用于用户移动 utterance 时重算 centroid.
- **进化**: 用户改名只改 name 不动 centroid; 用户把一句话移到另一角色 → 双方 centroid 用 utterances 表 raw_embedding 重算 (idempotent).

## 验收清单 (8 条)

1. ✅ `docker compose up` 起声纹服务 (4929 healthy)
2. ✅ 浏览器进入录音页, 看到 "开始录音" 按钮 + 自动模式开关 + 提示文字
3. ⏳ 真人录音验证: 一句话停顿后 1-2 秒归到某角色
4. ⏳ 真人录音验证: 同人讲第二句自动归到同一角色
5. ⏳ 真人录音验证: 换人讲话新角色出现
6. ✅ /voiceprints 页: 角色列表 + 进入详情看样本 + 播放/改名/移动
7. ✅ /meetings 页: 会议列表 + 进入看完整对话流 (色块标 speaker, 时间戳, 匹配 %)
8. ✅ 自动模式开关: UI checkbox + ingest API 接 `autoMode=1` 参数

3-5 项需要真实人声音验证, ECAPA 对纯合成音 (sin/noise) 区分较弱所以无法在 CI 自动测.

## 配置

**推荐方式（R10）**: 启动后访问 http://localhost:4927/settings，在页面上填写所有 key。

**备用方式（环境变量）**:

```bash
# web/.env.local
DASHSCOPE_API_KEY=sk-xxx          # DashScope ASR
ANTHROPIC_API_KEY=sk-ant-xxx      # Claude AI 总结（或用 settings 页配置）
ANTHROPIC_BASE_URL=https://...    # 可选，使用代理时设置
```

优先级: settings 表 > 环境变量 > 代码默认值

其他:
- 数据目录: `data/` (gitignore)
- 声纹服务: 默认 `localhost:4929`，可用 `VOICEPRINT_SERVICE_URL` 覆盖

## 已知边界

- **合成音区分差**: ECAPA 是 speaker verification 模型, 对人声专门优化. ffmpeg 生成的 sin 波 / 粉红噪声 会被归到同一个 speaker. 真实人声效果好得多.
- **首次启动 cold start**: 第一个 ingest 请求会比较慢 (Next.js 按需 compile + 声纹服务首次推理).
- **Web Audio ScriptProcessorNode 已 deprecated**: 浏览器 console 会有 warning. 改用 AudioWorklet 是后续优化项, 不影响功能.

## 项目结构

```
.
├── docs/
│   ├── INDEX.md                              # 知识库入口
│   ├── 开发计划/2026.05.19/voiceprint-meeting-recorder.md   # 本次 MVP 完整设计
│   └── 历史归档/v2.5-meetflow/               # 旧版 MeetFlow 归档
├── voiceprint-service/
│   ├── Dockerfile                            # CPU torch + speechbrain + 模型预下载
│   ├── main.py                               # FastAPI: POST /embed, GET /health
│   └── requirements.txt
├── web/
│   ├── src/app/
│   │   ├── page.tsx                          # 录音页 (通道选择 + ingest 端到端)
│   │   ├── voiceprints/[id]/page.tsx         # 角色详情
│   │   ├── meetings/[id]/page.tsx            # 会议详情 (SSE + AI 总结面板)
│   │   ├── settings/page.tsx                 # 配置页 (R10)
│   │   └── api/
│   │       ├── utterances/ingest/            # 声纹管线核心
│   │       ├── meetings/[id]/stream/         # SSE 流式字幕 (R8)
│   │       ├── meetings/[id]/summary/        # AI 总结 SSE (R9)
│   │       ├── settings/                     # GET/PATCH 配置 (R10)
│   │       └── agent/ping/                   # Anthropic 连通测试 (R10)
│   ├── src/lib/
│   │   ├── db.ts                             # better-sqlite3 + schema + getSetting()
│   │   ├── agent.ts                          # claude-agent-sdk + MCP server + 4 工具 (R9)
│   │   ├── sse-bus.ts                        # EventEmitter 单例 (R8)
│   │   ├── voiceprint-client.ts              # 调 4929
│   │   ├── match.ts                          # 三档阈值 + centroid 重算
│   │   └── wav.ts                            # PCM 重采样 + WAV 编码
│   └── src/components/
│       ├── AudioSourcePicker.tsx             # 录音通道选择 (R8)
│       ├── MicrophoneTester.tsx              # 音量计 + 静音告警 (R8)
│       └── nav.tsx                           # 顶部导航 (含 /settings)
├── data/
│   ├── vp.db                                 # SQLite (gitignore)
│   ├── segments/<uuid>.wav                   # 音频片段 (gitignore)
│   └── agent-memory/meeting_<id>.md          # AI 总结记忆 (gitignore)
└── docker-compose.yml
```
