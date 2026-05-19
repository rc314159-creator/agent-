# 2026-05-19 可进化声纹会议记录工具 MVP

**状态**: 执行中 (overnight)
**目标**: 砍掉现有 MeetFlow 所有无关功能 (画布/AI/MindMap/Workspace/CopilotKit/项目管理), 重塑为纯粹的会议记录工具, 核心是**可进化的声纹系统**.

---

## 1. 产品定位

不再是"群面记录助手 + 画布 + 思维导图 + AI 总结"那一坨. 现在是**纯粹的会议记录工具**:

- 打开 → 一个大按钮"开始录音"
- 讲话 → 实时字幕滚动 (不分人, 单气泡)
- 一句话讲完 (静音 800ms) → 1~2 秒内归到角色名下 (说话人 1 / 张三 / 新用户 N)
- 停止 → 留下完整对话流, 自动入库
- 跨会议 → 同一个人在下次会议会自动识别为同一人, 越用越准

**砍掉**: 画布, MindMap, AI 总结, CopilotKit, Workspace Context, 项目管理, SearXNG 搜索, 所有 web/tests/e2e/*.spec.ts.

---

## 2. 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│  浏览器 (localhost:4927)                                     │
│  ┌──────────────────┐                                        │
│  │  录音页 /         │  开始录音 + 实时字幕 + 自动模式开关      │
│  │  声纹库 /vp       │  角色列表 → 角色详情 → 样本播放/移走/改名 │
│  │  历史会议 /mt     │  会议列表 → 完整对话流                 │
│  └──────────────────┘                                        │
└────────────────────────────────────┬─────────────────────────┘
            ┌───────────────────────┼─────────────────────┐
            │  Next.js API Routes   │                     │
            │  /api/asr  (config)   │                     │
            │  /api/asr-diarize     │  (单段处理, 非整段)  │
            │  /api/speakers/*      │  CRUD/match/merge   │
            │  /api/meetings/*      │  CRUD               │
            │  /api/utterances/*    │  CRUD/move          │
            └───────────────────────┼─────────────────────┘
                                    │
            ┌───────────────────────┼─────────────────────┐
            ▼                       ▼                     ▼
   ┌────────────────┐    ┌──────────────────┐   ┌────────────────────┐
   │ ASR Proxy (WS) │    │ SQLite           │   │ Voiceprint Service │
   │ port 4928      │    │ data/vp.db       │   │ port 4929 (Docker) │
   │ → Qwen3-ASR    │    │ data/segments/   │   │ Python FastAPI     │
   │   Realtime     │    │   *.wav          │   │ + 3D-Speaker CAM++ │
   └────────────────┘    └──────────────────┘   │ POST /embed → 192d │
                                                └────────────────────┘
```

---

## 3. 数据模型 (SQLite)

```sql
CREATE TABLE speakers (
  id          TEXT PRIMARY KEY,         -- uuid
  name        TEXT NOT NULL,            -- "张三" / "新用户 3"
  sample_count INTEGER DEFAULT 0,
  centroid    BLOB,                     -- 192 * 4 bytes float32, 平均向量
  created_at  INTEGER,
  updated_at  INTEGER
);

CREATE TABLE meetings (
  id          TEXT PRIMARY KEY,
  title       TEXT,                     -- "会议 2026-05-19 22:30"
  started_at  INTEGER,
  ended_at    INTEGER
);

CREATE TABLE utterances (
  id            TEXT PRIMARY KEY,
  meeting_id    TEXT,
  speaker_id    TEXT,                   -- FK -> speakers.id, 可改
  text          TEXT,
  start_ms      INTEGER,
  end_ms        INTEGER,
  audio_path    TEXT,                   -- data/segments/<uuid>.wav
  raw_embedding BLOB,                   -- 192 * 4 bytes float32, 原始
  confidence    REAL,                   -- 匹配时的余弦相似度
  needs_review  INTEGER DEFAULT 0,      -- 0=自动归 / 1=待确认
  created_at    INTEGER
);

CREATE INDEX idx_utterances_meeting ON utterances(meeting_id);
CREATE INDEX idx_utterances_speaker ON utterances(speaker_id);
```

**为什么不用向量数据库**: 单机 100 个 speaker 量级, 全表余弦只要几毫秒. 引入 sqlite-vss / pgvector 反而徒增复杂度.

---

## 4. 关键算法

### 4.1 VAD 切句 (前端)

- 用 `@ricky0123/vad-web` npm 包 (Silero VAD onnx, 浏览器内跑)
- 检测到语音开始 → 缓存 PCM
- 检测到 800ms 静音 → "封段", 立即触发处理
- 段长保护: 0.5s ~ 30s, < 0.5s 丢弃, > 30s 强制切

### 4.2 实时声纹处理流水

```
封段 PCM (Float32)
  ↓ resample 16kHz, encode WAV
  ↓ POST /api/utterances/ingest (multipart: meetingId + audio + asrText)
  ↓
后端:
  保存 WAV → data/segments/<uuid>.wav
  调声纹服务 /embed → 192d float32
  跑匹配:
    foreach speaker in db:
      score = cosine(emb, speaker.centroid)
    取 max
  根据阈值 + 自动模式:
    高 (>=0.75): 归到该 speaker, 重算 centroid
    中 (0.6~0.75):
      自动模式开 → 归到该 speaker
      自动模式关 → 归 + needs_review=1
    低 (<0.6): 建新 speaker "新用户 N"
  写入 utterances 表
  返回 {speakerId, speakerName, confidence, needsReview}
  ↓
前端: 上屏到对应角色名下
```

### 4.3 centroid 增量更新

```python
# 加权平均, 最近的样本权重高一点
new_centroid = (old_centroid * old_sample_count + new_embedding * 1.0) / (old_sample_count + 1)
new_centroid = new_centroid / ||new_centroid||  # L2 归一化
```

只保留 centroid 不存所有 sample 也行, 但样本数据保留可用于:
- 用户在 UI 上看某角色的所有发言
- 用户移动 utterance 时, 双方 centroid 重算 (用 utterances 表里的 raw_embedding)

### 4.4 用户移动 utterance

```
用户在角色 A 的样本列表点 "移到 → B"
  ↓
后端:
  UPDATE utterances SET speaker_id=B WHERE id=X
  重算 A.centroid = mean(剩余 utterances where speaker_id=A 的 raw_embedding)
  重算 B.centroid = mean(所有 utterances where speaker_id=B 的 raw_embedding)
  更新 A.sample_count -= 1, B.sample_count += 1
```

---

## 5. API 设计

### Next.js API Routes

```
GET    /api/asr                              # ASR 配置 (wsUrl, model)
POST   /api/utterances/ingest                # 多步: 存WAV + embed + match + 入库. body: form-data{meetingId, audio:Blob, text, startMs, endMs}
                                              # response: {utteranceId, speakerId, speakerName, confidence, needsReview}

POST   /api/meetings                         # 创建会议. response: {id, title, startedAt}
PATCH  /api/meetings/:id                     # 结束会议 / 改标题
GET    /api/meetings                         # 列表
GET    /api/meetings/:id                     # 详情, 含所有 utterances JOIN speakers

GET    /api/speakers                         # 列表 + sample_count
GET    /api/speakers/:id                     # 详情 + 该 speaker 的所有 utterances
PATCH  /api/speakers/:id                     # 改名 (不影响 centroid)
POST   /api/speakers/:id/merge               # 把 A 的所有 utterances 合并到 B, 删 A. body: {targetId}

PATCH  /api/utterances/:id                   # 移动 speaker. body: {speakerId}
GET    /api/utterances/:id/audio             # 返回 WAV 流, 用于前端播放

GET    /api/segments/:filename               # 直接 serve data/segments/*.wav
```

### Voiceprint Service (Python FastAPI, port 4929)

```
POST /embed
  Content-Type: audio/wav (或 multipart: audio)
  Response: {"embedding": [192 个 float], "model": "cam++"}

GET  /health
  Response: {"status": "ok", "model": "cam++"}
```

---

## 6. UI 草图

### 6.1 录音页 `/`

```
┌─────────────────────────────────────────────────────────┐
│  会议记录                       [声纹库] [历史会议] [⚙]   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│        ┌────────────────────┐                            │
│        │   ● 开始录音        │   会议: 2026-05-19 22:30  │
│        └────────────────────┘                            │
│                              自动模式: [○ ]              │
│                                                          │
├─────────────────────────────────────────────────────────┤
│  ● 讲话中... 10:23                                       │
│    "今天我们讨论..."                                     │
│                                                          │
│  ● 张三  10:24    匹配 87%                              │
│    "方案 A 更好"                                         │
│                                                          │
│  ⚠ 李四  10:25    匹配 68%  [确认是李四] [换人]          │
│    "我补充一下"                                          │
│                                                          │
│  ● 新用户 3  10:26   [改名]                              │
│    "..."                                                 │
└─────────────────────────────────────────────────────────┘
```

### 6.2 声纹库页 `/voiceprints`

```
┌─────────────────────────────────────────────────────────┐
│  声纹库                                                  │
├─────────────────────────────────────────────────────────┤
│  张三       47 次发言    最近 5/19                      │
│  李四       23 次发言    最近 5/18                       │
│  新用户 3    3 次发言    最近 5/19  [改名]               │
└─────────────────────────────────────────────────────────┘
              点击进入张三 ↓
┌─────────────────────────────────────────────────────────┐
│  ← 张三 (47 次发言)                          [改名] [合并]│
├─────────────────────────────────────────────────────────┤
│  ▶ 5/19 22:25  "今天我们讨论..."           匹配 87%      │
│    [播放]  [✗ 不是张三 → 移到...]                        │
│                                                          │
│  ⚠ 5/19 22:26  "我补充一下"               匹配 68%       │
│    [播放]  [✓ 确认]  [✗ 移到...]                         │
│                                                          │
│  ▶ 5/18 15:02  "方案 A 更好"              匹配 91%       │
│    [播放]  [✗ 移到...]                                   │
└─────────────────────────────────────────────────────────┘
```

### 6.3 历史会议页 `/meetings`

```
┌─────────────────────────────────────────────────────────┐
│  历史会议                                                │
├─────────────────────────────────────────────────────────┤
│  会议 2026-05-19 22:30   23 分钟  3 人 47 句  [打开]    │
│  会议 2026-05-18 14:00   1 小时  5 人 142 句 [打开]      │
└─────────────────────────────────────────────────────────┘
```

---

## 7. 砍代码清单

### 删除 (web/src 下)

```
components/canvas/                   整个画布
components/mindmap/                  整个 MindMap
components/ai/                       AI 相关组件
components/workspace/                Workspace 相关
components/voice/SummaryDialog.tsx   AI 总结弹窗
components/layout/                   (保留, 但精简成最小)
hooks/useProject.ts                  项目管理 hook
hooks/useWorkspace.ts                workspace context
hooks/useAIToggle.ts                 AI 开关
app/api/copilotkit/                  copilotkit 后端
app/api/projects/                    项目 CRUD
app/api/search/                      SearXNG 代理
app/api/ai/                          AI 总结后端
```

### 重构 (大改, 但保留)

```
components/voice/VoicePanel.tsx → app/page.tsx (录音页内联)
  - 砍掉 useWorkspace / useProject / useAIToggle 依赖
  - 改成 VAD 切句 + 单段实时 ingest, 不再是停止后整段 diarize
  - 砍掉 SummaryDialog 调用

lib/voiceprint.ts
  - 玩具版 24 维提取逻辑全删
  - 改成纯类型定义 + 客户端调 /api/utterances/ingest 的辅助函数

app/api/asr-diarize/route.ts → 改成 /api/utterances/ingest/diarize-single 单段
  或干脆不要 Paraformer (本来是用来分人的, 现在分人交给声纹服务)
  保留为可选 "ASR-only" 备份: 如果浏览器 Qwen 实时 ASR 出文本不全,
  可以拿 PCM 段交给 Paraformer 重新转写一次, 不再做 diarize.
  → 决定: 先不留 Paraformer, 直接用 Qwen 实时 ASR 的文本, 简化数据流.
```

### 新增

```
voiceprint-service/                 新增, Python FastAPI + 3D-Speaker
  Dockerfile
  main.py
  requirements.txt
  models/                           (cached 3D-Speaker checkpoint)

web/src/lib/db.ts                   SQLite 客户端 (better-sqlite3)
web/src/lib/voiceprint-client.ts    封装调 voiceprint-service 的 fetch
web/src/lib/match.ts                centroid 匹配 + 三档阈值 + 自动模式

web/src/app/page.tsx                录音页 (取代旧 dashboard)
web/src/app/voiceprints/page.tsx    声纹库列表
web/src/app/voiceprints/[id]/page.tsx 角色详情
web/src/app/meetings/page.tsx       会议列表
web/src/app/meetings/[id]/page.tsx  会议详情

web/src/app/api/utterances/ingest/route.ts
web/src/app/api/meetings/route.ts
web/src/app/api/meetings/[id]/route.ts
web/src/app/api/speakers/route.ts
web/src/app/api/speakers/[id]/route.ts
web/src/app/api/segments/[name]/route.ts

docker-compose.yml                  根目录, 起 voiceprint-service
data/vp.db                          SQLite (gitignore)
data/segments/                      WAV 片段 (gitignore)
```

### 归档 (保留历史)

```
docs/开发计划/2026.04.*/             整个 4 月的开发计划归档到
docs/历史归档/v2.5-meetflow/         保留可查
旧版 docs/INDEX.md 重写为新版本
src/ Python 后端                    整个目录原地放着, 不参与新功能
```

---

## 8. 执行顺序 (按 overnight 轮次)

| 轮 | 内容 | 产出 commit |
|----|------|-------------|
| 1 | 飞行前: 读 INDEX + 写计划 + 写新 INDEX + 归档旧 docs | `chore: archive v2.5 docs + pivot to voiceprint MVP` |
| 2 | 大砍代码: git rm 一坨, 切分支 mvp-voiceprint | `chore: remove canvas/mindmap/ai/workspace/copilotkit` |
| 3 | 声纹服务: voiceprint-service/ FastAPI + 3D-Speaker docker | `feat: voiceprint service with 3D-Speaker` |
| 4 | SQLite + REST API | `feat: SQLite layer + utterance/meeting/speaker APIs` |
| 5 | 前端三页面骨架 (静态先跑通路由) | `feat: 3-page UI skeleton (recorder/voiceprints/meetings)` |
| 6 | VAD 切句 + 端到端实时声纹串联 | `feat: VAD + realtime voiceprint pipeline` |
| 7+ | 验证 + 修复, 直到 8 条验收标准全过 | (按 bug 单独 commit) |

---

## 9. 配置 / 环境

- DashScope API key: `sk-e2c4923387e147629d69b634dcb9a1a1` (在 asr-proxy.ts 已有)
- 端口分配:
  - 4927: Next.js
  - 4928: ASR proxy (WS to Qwen Realtime)
  - 4929: Voiceprint Service (Docker)
- 数据目录: `data/vp.db`, `data/segments/`
- 模型: 3D-Speaker CAM++, ModelScope `damo/speech_campplus_sv_zh-cn_16k-common`

---

## 10. MVP 验收标准 (Critic 必须实际验证)

1. `docker compose up` 起全套 (Next.js + ASR proxy + voiceprint service)
2. 浏览器到 http://localhost:4927 录音页, 点录音, 看到实时字幕滚动
3. 真人讲一句话停 1 秒, 1-2 秒内归到某角色
4. 同人讲第二句, 自动归到同一角色
5. 换人讲话, 新角色出现
6. /voiceprints 角色列表 + 样本播放 + 改名 + 移动
7. 停止后到 /meetings 看完整对话流
8. 自动模式开关有效

---

## 11. 已知风险

- **3D-Speaker docker 第一次 build 慢**: ModelScope 拉模型 + 装 funasr/modelscope 依赖, ~5-10 分钟. 如果网络问题, 降级到 HuggingFace `pyannote/embedding` 或 `microsoft/wavlm-base-plus-sv`.
- **better-sqlite3 在 Next.js Edge runtime 不可用**: API Routes 必须用 nodejs runtime (export const runtime = 'nodejs')
- **VAD 模型加载**: @ricky0123/vad-web 需要 onnxruntime-web wasm, 大约 1MB, 首次加载有延迟. 录音前预加载.
- **音频片段存储**: 每条 WAV ~50KB, 100 句会议 ~5MB, 不需要做存储优化.

---

## 12. 历史归档说明

本计划取代之前 MeetFlow v1.0~v2.5 的所有规划. 旧 docs 已 git mv 到 `docs/历史归档/v2.5-meetflow/`, 仅供回溯参考. 新 INDEX 不再引用.
