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

## 三个页面

| 路径 | 功能 |
|------|------|
| `/` | 录音页. 点录音 → 讲话 → 字幕实时滚动 → 每句话停顿后 1-2 秒归到角色 |
| `/voiceprints` | 声纹库. 看所有角色, 进角色详情可以听每段样本、改名、移动到别的角色 |
| `/meetings` | 历史会议. 完整对话流 |

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

- DashScope API key: `web/.env.local` 里的 `DASHSCOPE_API_KEY`
- 数据目录: `data/` (gitignore)
- 声纹服务环境: 默认从 `localhost:4929` 拿, 可用 `VOICEPRINT_SERVICE_URL` 覆盖

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
│   │   ├── page.tsx                          # 录音页 (VAD + ingest 端到端)
│   │   ├── voiceprints/page.tsx              # 声纹库列表
│   │   ├── voiceprints/[id]/page.tsx         # 角色详情
│   │   ├── meetings/page.tsx                 # 历史会议列表
│   │   ├── meetings/[id]/page.tsx            # 会议详情
│   │   └── api/                              # SQLite REST API
│   ├── src/lib/
│   │   ├── db.ts                             # better-sqlite3 + schema
│   │   ├── voiceprint-client.ts              # 调 4929
│   │   ├── match.ts                          # 三档阈值 + centroid 重算
│   │   └── wav.ts                            # PCM 重采样 + WAV 编码
│   └── src/components/nav.tsx                # 顶部三 tab 导航
├── data/
│   ├── vp.db                                 # SQLite (gitignore)
│   └── segments/<uuid>.wav                   # 音频片段 (gitignore)
└── docker-compose.yml
```
