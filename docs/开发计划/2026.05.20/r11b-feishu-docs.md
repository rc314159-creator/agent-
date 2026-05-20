---
title: R11b — 飞书 3 份文档大纲（项目介绍 / 使用指南 / 系统原理）
状态: 进行中
创建日期: 2026-05-20
飞书账号: 个人账号 cli_a926a77ebf785bd1
飞书文档链接:
  项目介绍: https://anycross.feishu.cn/docx/JQg4ddDwpok8YkxjINJcvTJznWe
  使用指南: (待 worker-b 完成)
  系统原理: (待 worker-b 完成)
---

# R11b — 飞书文档大纲

## 背景

为会议记录工具撰写 3 份飞书文档，覆盖：项目介绍（给潜在用户 / 决策者看）、
使用指南（给日常使用者看）、系统原理（给开发者 / 技术评审看）。

飞书账号：个人账号 `cli_a926a77ebf785bd1`，通过 `npx @larksuite/cli` 操作。

---

## 文档一：项目介绍

**文档标题：** 会议记录工具 — 项目介绍

**目标读者：** 产品 / 业务决策者、有录会议需求的用户

**结构大纲：**

```
# 会议记录工具

## 一句话定位
把会议录音实时转化成"谁说了什么"，声纹库越用越准。

## 三大核心能力

### 1. 实时语音转文字
- 支持麦克风、系统音频、混合三种录音通道
- 阿里云 Qwen3-ASR-Flash-Realtime 提供实时字幕
- 发言段自动切分，每段独立存储

### 2. 声纹识别与角色绑定
- 基于 3D-Speaker CAM++ 模型提取 192 维声纹特征
- 三档匹配阈值：自动归属 / 待确认 / 新用户
- 用户修正即时反馈：声纹库越用越准
- 角色信息跨会议持久化（"张三"在所有历史会议中均可识别）

### 3. AI 多轮问答
- 基于 Claude Agent SDK，可对任意会议发起问答
- 内置推荐提问：总结会议 / 列出待办 / 分析发言人 / 关键决策
- 历史 memory 注入：AI 了解参会者背景，总结更准确
- 支持下载会议记录 Markdown + AI 对话 Markdown

## 技术栈一览
| 层次 | 技术 |
|------|------|
| 前端 | Next.js 15 + React 19 + Tailwind CSS |
| 后端 | Next.js API Routes + better-sqlite3 |
| ASR | 阿里云百炼 Qwen3-ASR-Flash-Realtime（WebSocket） |
| 声纹 | 3D-Speaker CAM++ via Docker（本地推理） |
| AI Agent | Anthropic Claude + claude-agent-sdk |
| 存储 | SQLite（vp.db）+ 本地 WAV 文件 |
| 部署 | docker-compose（声纹服务）+ Node.js（Next.js） |

## 版本历史
| 版本 | 日期 | 主要内容 |
|------|------|---------|
| R7 | 2026-05-19 | 核心录音管线 + 声纹归属 + docker-compose |
| R8 | 2026-05-20 | 录音通道选择（麦克风/系统/混合）+ SSE 实时字幕 |
| R9 | 2026-05-20 | Claude Agent SDK + 会议总结 + 跨会议 memory |
| R10 | 2026-05-20 | /settings 配置页 + SQLite settings 表 |
| R11 | 2026-05-20 | AI 多轮问答 + 下载导出 + Settings 按功能重构 |

## 截图占位
<!-- 录音页截图 -->
<!-- 声纹库截图 -->
<!-- AI 问答截图 -->
<!-- Settings 页截图 -->
```

---

## 文档二：使用指南

**文档标题：** 会议记录工具 — 使用指南

**目标读者：** 日常使用者（会议参与者、秘书、研究员）

**结构大纲：**

```
# 会议记录工具 — 使用指南

## 环境要求

- Node.js 18+（运行 Next.js）
- Docker Desktop（运行声纹服务）
- 现代浏览器（Chrome / Edge 推荐，支持 Web Audio API）
- 阿里云百炼 API Key（ASR 服务）
- Anthropic API Key（AI 问答功能，可选）

## 快速启动

### 1. 启动声纹服务
```bash
docker-compose up -d voiceprint-service
```

### 2. 启动 Web 服务
```bash
cd web && npm install && npm run dev
```

### 3. 配置 API Key
- 打开 http://localhost:4927/settings
- 填写 DashScope API Key（ASR 语音识别必填）
- 填写 Anthropic API Key（AI 问答可选）
- 点击各功能块的「测试」按钮验证连通性

## 录音操作

### 选择录音通道
工具支持三种录音模式：
- **麦克风**：适合当面开会，录制与会人员发言
- **系统音频**：适合远程会议（Zoom / 腾讯会议等），录制电脑播放的声音
- **混合**：同时录制麦克风和系统音频（需授权共享屏幕）

### 开始录音
1. 在首页选择录音通道
2. 点击麦克风图标测试音量
3. 点击「开始录音」
4. 实时字幕显示在页面下方，每句话附带说话人标签

### 停止录音
- 点击「停止录音」，会议自动保存并可在「历史会议」查看

## 声纹管理

### 首次使用
- 系统默认将说话人标记为「新用户 1」「新用户 2」等
- 每次发言后提取声纹特征，相似声纹自动归并

### 给角色命名
1. 进入「声纹库」页面
2. 点击任意角色右侧的编辑按钮
3. 输入真实姓名，保存

### 修正归属
- 如果某条发言被错误归属到其他角色
- 点击该发言段右侧的「...」菜单 → 「移动到其他角色」
- 系统自动重算声纹模型，下次识别更准确

## AI 问答

### 打开 AI 问答
- 进入任意历史会议详情页
- 点击右上角「AI 问答」区域展开

### 推荐提问
首次打开显示 4 个推荐 chips：
- **帮我总结这次会议**：生成议题、结论、待办摘要
- **列出所有待办事项**：提取行动项和负责人
- **分析各人发言**：发言次数、主要观点、角色定位
- **关键决策**：梳理决策背景和依据

### 自定义提问
- 在底部输入框输入任意问题，回车或点击发送
- AI 感知对话历史，支持追问（如「详细说说第二点」）

## 下载导出

在会议详情页顶部有两个下载按钮：
- **下载记录**：导出 `会议记录-<标题>.md`，包含完整角色绑定发言流
- **下载对话**：导出 `AI对话-<标题>.md`，包含 AI 问答完整历史

## Settings 页说明

### ASR (语音识别)
- DashScope API Key：阿里云百炼控制台获取
- WebSocket URL：默认无需修改（DashScope 官方地址）
- 测试连接：验证 key 有效性和网络连通性

### Agent (AI 问答)
- API Key：Anthropic 官方或中转站 key
- Provider 预设：Anthropic 官方 / 云雾中转 / 自定义
- 模型：推荐 claude-sonnet-4-5-20250929（速度快）或 claude-opus-4-7（质量高）
- System Prompt：自定义 AI 角色和行为
- 测试连通性：发送一条测试消息验证 key 和模型可用

### Voiceprint (声纹服务)
- 服务 URL：默认 http://localhost:4929，对应 Docker 声纹容器
- 测试声纹服务：检查 Docker 容器是否正在运行

## FAQ

**Q: 为什么声纹识别一开始不准？**
A: 首次见到某人声音时样本量少，声纹 centroid 不稳定。随着会议次数增加（尤其是用户主动修正归属后），识别准确率快速提升。

**Q: 系统音频录制需要什么权限？**
A: 浏览器会要求「共享屏幕」权限，选择任意窗口或整个屏幕即可（视频不会被录制，仅录音频）。

**Q: AI 问答不回复，显示错误？**
A: 先在 Settings > Agent 点击「测试连通性」，确认 API Key 和 Base URL 正确配置。

**Q: 数据存储在哪里？**
A: SQLite 数据库在 `data/vp.db`，WAV 音频片段在 `data/segments/`，均为本地文件，不上传云端。
```

---

## 文档三：系统原理

**文档标题：** 会议记录工具 — 系统原理

**目标读者：** 开发者、技术评审、对实现细节感兴趣的用户

**结构大纲：**

```
# 会议记录工具 — 系统原理

## 整体架构图

[ASCII / 图片占位]

```
浏览器 (localhost:4927)
  ├─ /               录音页
  ├─ /voiceprints    声纹库
  ├─ /meetings/[id]  会议详情 + AI 问答
  └─ /settings       配置页
        │
        │  Next.js API Routes
        ├─ /api/meetings/*        会议 CRUD + SSE + chat
        ├─ /api/utterances/*      发言段 CRUD + 声纹管线
        ├─ /api/settings          配置读写
        ├─ /api/agent/ping        Agent 连通测试
        ├─ /api/asr/ping          ASR 连通测试
        └─ /api/voiceprint-health 声纹服务健康检查
              │
  ┌───────────┴──────────┐    ┌──────────────────────────┐
  │  ASR Proxy (4928)    │    │  Voiceprint Svc (4929)   │
  │  Node.js WS bridge   │    │  Python FastAPI + Docker  │
  │  → DashScope         │    │  POST /embed → 192d emb   │
  └──────────────────────┘    └──────────────────────────┘
                                        │
                               SQLite data/vp.db
                               data/segments/*.wav
```

## 录音管线详解

### 通道 Mux（R8）
三种通道均通过 Web Audio API 采集，统一转换为 16kHz 单声道 PCM：
- 麦克风：`getUserMedia({ audio: true })`
- 系统音频：`getDisplayMedia({ video: true, audio: true })` + 立即 stop video tracks
- 混合：AudioContext 将两路 source 连接到同一 destination

### VAD 切句
使用 `@ricky0123/vad-web`（Silero VAD），静音 800ms 触发 `flushSegment()`：
1. PCM chunks 拼接 → `encodeWav()`
2. POST `/api/utterances/ingest` 携带 WAV bytes + 文字 + 时间戳
3. 服务端写文件到 `data/segments/<uuid>.wav`

### ASR 桥接
- 浏览器 → WebSocket → ASR Proxy (4928) → DashScope Qwen3-ASR-Flash-Realtime
- 实时返回 `conversation.item.input_audio_transcription.text` 事件
- 最终句子由 `completed` 事件触发 flushSegment

## 声纹算法

### 特征提取
- 模型：3D-Speaker CAM++ (`damo/speech_campplus_sv_zh-cn_16k-common`)
- 输入：16kHz 单声道 WAV
- 输出：192 维 float32 向量（L2 归一化）

### 匹配算法
- 相似度度量：余弦相似度
- 全表扫描（speakers 表，100 角色量级，< 1ms）
- 三档阈值：
  - ≥ 0.75：自动归属
  - 0.6 ~ 0.75：待确认（autoMode 决定是否加 needs_review 标记）
  - < 0.6：创建新用户

### Centroid 进化
每次新发言归属后执行增量更新：
```
new_centroid = normalize(old_centroid × n + new_embedding) / (n + 1)
```
用户手动移动 utterance 时，双方 centroid 完整重算（从所有 raw_embedding 平均）。

## SSE 总线（R8）

服务端 EventEmitter 单例（`lib/sse-bus.ts`）：
- `globalThis.__sseBus` 保证 Next.js HMR 重载不丢订阅
- 写端（ingest route）：`bus.emit("meeting:<id>", data)`
- 读端（stream route）：ReadableStream，每 15s 发 ping 保活
- 浏览器：`new EventSource("/api/meetings/<id>/stream")`

## AI Agent / Claude Agent SDK（R9）

### query() 调用链
```
runSummaryAgent / runChatAgent
  → query({ prompt, options: { model, env, systemPrompt,
            mcpServers, allowedTools, permissionMode } })
  → claude-agent-sdk 内部 tool calling loop
  → MCP server（本地进程内，createSdkMcpServer）
       ├─ get_meeting_transcript   → SQLite utterances JOIN speakers
       ├─ list_speakers            → SQLite speakers
       ├─ search_speaker_history   → SQLite 跨会议发言
       └─ search_past_meetings     → SQLite LIKE 全文搜索
```

### 多轮 Chat（R11 新增）
- `meeting_chats` 表持久化对话历史
- 每次新 message：从 DB 读取历史 → 拼接 prompt → query()
- 最大历史：最近 6 条（3 轮），避免 token 超限

### 跨会议 Memory
- `data/agent-memory/meeting_<id>.md` 存储每次 AI 总结结果
- 下次问答时，`loadPastSummaries(dataDir, 5)` 注入到 system prompt
- 效果：AI 知道「张三在上次会议中提了方案 A」

## 数据模型

```sql
speakers   (id, name, sample_count, centroid BLOB, created_at, updated_at)
meetings   (id, title, started_at, ended_at)
utterances (id, meeting_id, speaker_id, text, start_ms, end_ms,
            audio_path, raw_embedding BLOB, confidence, needs_review, created_at)
settings   (key, value)
meeting_chats (id, meeting_id, role, content, created_at)  -- R11 新增
```

## Settings 配置优先级

```
settings 表（用户 UI 配置）
  > process.env（.env 文件 / 容器环境变量）
  > 硬编码默认值
```

R11 新增 DB key（旧 key 向后兼容）：
- `agent_api_key`（fallback: `anthropic_api_key`）
- `agent_base_url`（fallback: `anthropic_base_url`）
- `asr_api_key`（fallback: `dashscope_api_key`）
- `asr_ws_url`（新增）
- `voiceprint_url`（新增）

## 关键设计决策

| 决策 | 原因 |
|------|------|
| SQLite 不用向量数据库 | 100 角色量级，全表余弦扫描 < 1ms |
| SSE bus 用 EventEmitter 单例 | 单进程 Next.js dev，globalThis 保证 HMR 安全 |
| AI 总结用文件 memory（agent-memory/） | 便于直接编辑；同时作为 SDK 历史 context 注入点 |
| API key 脱敏在 API 层 | 防止 key 通过 XHR response 被 JS 读取泄露 |
| Settings 按功能块拆分（R11） | 配置语义清晰，不绑定到具体 provider；各功能独立测试 |
```

---

## 飞书 OpenAPI 调用模板

账号：个人账号
- App ID：`cli_a926a77ebf785bd1`
- App Secret：`GpmkNjuqlhFwJrOGevuzgcFYfwJCdoIK`

### Step 1：取 tenant_access_token

```bash
TOKEN=$(curl -s -X POST https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal \
  -H "Content-Type: application/json" \
  -d '{"app_id":"cli_a926a77ebf785bd1","app_secret":"GpmkNjuqlhFwJrOGevuzgcFYfwJCdoIK"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['tenant_access_token'])")
echo "TOKEN=$TOKEN"
```

### Step 2：创建文档（docx）

每份文档执行一次，记录返回的 `document_id`：

```bash
# 文档一：项目介绍
DOC1=$(curl -s -X POST https://open.feishu.cn/open-apis/docx/v1/documents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"会议记录工具 — 项目介绍"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['document']['document_id'])")

# 文档二：使用指南
DOC2=$(curl -s -X POST https://open.feishu.cn/open-apis/docx/v1/documents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"会议记录工具 — 使用指南"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['document']['document_id'])")

# 文档三：系统原理
DOC3=$(curl -s -X POST https://open.feishu.cn/open-apis/docx/v1/documents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"会议记录工具 — 系统原理"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['document']['document_id'])")

echo "DOC1=$DOC1  DOC2=$DOC2  DOC3=$DOC3"
```

### Step 3：获取文档根块 block_id

写入内容前需要知道根块 ID（即文档 body 块）：

```bash
ROOT1=$(curl -s "https://open.feishu.cn/open-apis/docx/v1/documents/$DOC1/blocks?page_size=50" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; blocks=json.load(sys.stdin)['data']['items']; \
    print(next(b['block_id'] for b in blocks if b['block_type']==1))")
# 对 DOC2 / DOC3 重复同样操作，得到 ROOT2 / ROOT3
```

### Step 4：批量插入内容块

飞书 docx 写入使用 `batch_update` 接口，每次插入一批段落块。
段落块类型：`2` = paragraph，`12` = heading1，`13` = heading2。

**通用写入函数模板（Python）：**

```python
import requests, json

def insert_paragraph(token, doc_id, parent_id, index, text, block_type=2):
    """block_type: 2=paragraph, 12=h1, 13=h2, 14=h3"""
    style = {}
    if block_type == 12:
        style = {"align": 1}  # heading_level handled by block_type
    payload = {
        "requests": [{
            "insert_blocks": {
                "index": index,
                "parent_block_id": parent_id,
                "blocks": [{
                    "block_type": block_type,
                    "paragraph" if block_type == 2 else
                    "heading1" if block_type == 12 else
                    "heading2" if block_type == 13 else "heading3": {
                        "elements": [{"text_run": {"content": text}}]
                    }
                }]
            }
        }]
    }
    r = requests.post(
        f"https://open.feishu.cn/open-apis/docx/v1/documents/{doc_id}/blocks/{parent_id}/batch_update",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=payload
    )
    return r.json()
```

### Step 5：写入各文档内容

按照上方三份文档大纲，逐段调用 `insert_paragraph()`，顺序写入标题和正文。

建议实现为 Python 脚本 `scripts/create_feishu_docs.py`：
- 接收 `--token $TOKEN --doc1 $DOC1 --doc2 $DOC2 --doc3 $DOC3` 参数
- 按大纲顺序循环写入，每写入一段打印确认
- 最后输出三个文档的飞书链接：`https://test-larkuite.feishu.cn/docx/<document_id>`

### Step 6：获取文档链接

```bash
# 文档链接格式（飞书国内版）
echo "文档一：https://feishu.cn/docx/$DOC1"
echo "文档二：https://feishu.cn/docx/$DOC2"
echo "文档三：https://feishu.cn/docx/$DOC3"
```

### 注意事项

1. `tenant_access_token` 有效期 2 小时，脚本运行超时需重新获取
2. 飞书文档 API 单次 `batch_update` 建议不超过 50 个块，分批写入
3. 代码块（`block_type=10`）+ `code` 字段 可写入代码片段
4. 如需在知识库（wiki）中创建而非独立文档，改用 `/wiki/v2/spaces/{space_id}/nodes` 接口
5. 个人账号无知识库管理权限，默认创建为个人文档（我的文档），可事后手动移入空间
