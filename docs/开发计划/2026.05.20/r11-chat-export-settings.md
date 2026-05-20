---
title: R11 — AI 问答 Chat 面板 + 下载导出 + Settings 按功能重构
状态: 草稿
创建日期: 2026-05-20
关联: docs/架构设计/系统架构.md, docs/开发计划/2026.05.20/r10-settings-page.md
---

# R11 — AI 问答 Chat 面板 + 下载导出 + Settings 按功能重构

## 背景与目标

用户原话（需求来源）：

> "在浏览器前端添加导出下载 会议文字记录.md 和 ai总结.md 的功能，
> 或者直接让ai总结变成ai问答得了，然后推荐的提问有帮我总结一下这次的会议，
> 注意记录的时候，角色要和说话的人绑定起来"

> "配置是针对每个功能配置，不是基于api中转站的配置，而是针对功能配置 url, apikey,
> 以及models，然后在配置页面要有测试按钮"

目标：
1. 把「AI 总结」面板改造为「AI 问答」Chat 面板，支持多轮问答
2. 推荐 prompt chips（总结会议 / 待办事项 / 发言人分析 / 关键决策）
3. transcript 格式升级：`[角色名 hh:mm:ss] 发言内容`（角色与说话人绑定）
4. 两个下载按钮：会议文字记录.md + AI 对话记录.md
5. Settings 页按功能重构：ASR / Agent / Voiceprint 三个独立配置块，各有独立测试按钮
6. DB key 重命名并迁移（向后兼容读取旧 key）

---

## 1. AI 问答 Chat 面板设计

### 1.1 消息结构

```typescript
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;       // Markdown
  timestamp: number;
  toolEvents?: ToolEvent[];  // 伴随本条 assistant 消息的 tool 调用
}
```

### 1.2 UI 布局（ASCII 草图）

```
┌─────────────────────────────────────────────────────────────┐
│  [← 返回历史会议]   会议 2026-05-20 15:30   [↓ 下载记录] [↓ 下载对话]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  对话流（左侧，约 55%）    │  AI 问答（右侧，约 45%）        │
│                           │                                │
│  [角色 A 00:01:23]        │  推荐提问：                    │
│    "今天讨论..."          │  [帮我总结这次会议] [列出待办]  │
│                           │  [分析各人发言]  [关键决策]    │
│  [角色 B 00:02:05]        │  ─────────────────────────    │
│    "我觉得 A 方案..."     │  [用户] 帮我总结这次会议       │
│                           │  ─────────────────────────    │
│  [角色 A 00:02:30]        │  [AI] ## 会议总结              │
│    "好，那就..."          │  • 议题：...                   │
│                           │  • 结论：...                   │
│                           │  ─────────────────────────    │
│                           │  [用户输入框          ] [发送] │
└───────────────────────────┴────────────────────────────────┘
```

### 1.3 推荐 Prompt Chips（固定 4 个）

| Chip 标签 | 发送内容 |
|-----------|---------|
| 帮我总结这次会议 | `请帮我总结这次会议的核心内容，包括议题、结论和待办事项。` |
| 列出所有待办事项 | `请从这次会议记录中提取所有待办事项，并标明负责人（如有提及）。` |
| 分析各人发言 | `请分析这次会议中每位参与者的发言情况，包括发言次数、主要观点和角色定位。` |
| 关键决策 | `这次会议做出了哪些关键决策？每条决策的背景和依据是什么？` |

首次进入 chat 面板时显示推荐 chips；发送任何消息后 chips 折叠（可点按钮展开）。

### 1.4 多轮对话上下文

每次用户发送新消息时，将完整的 chatMessages 历史拼入 prompt 传给 Agent，让 Agent 感知上下文。格式：

```
[历史对话]
用户：XXX
助手：XXX
...
[当前问题]
用户：YYY
```

---

## 2. Transcript 格式：角色绑定

### 2.1 格式规范

每行：`[角色名 hh:mm:ss] 发言内容`

- `角色名`：来自 `speakers.name`（用户已命名）；未命名则显示 `新用户 N`
- `hh:mm:ss`：相对于会议开始时间的偏移（`start_ms` 字段转换）
- 发言内容：`utterances.text`

示例：
```markdown
# 会议记录 — 2026-05-20 15:30

[张三 00:01:23] 今天我们主要讨论方案选型的问题。
[李四 00:02:05] 我觉得 A 方案在性能上更有优势。
[张三 00:02:30] 那我们就定 A 方案，后续由李四输出技术文档。
```

### 2.2 GET /api/meetings/[id]/transcript.md

```
GET /api/meetings/:id/transcript.md
Response: text/markdown; charset=utf-8
Content-Disposition: attachment; filename="会议记录-<title>.md"

# 会议记录 — <title>

**开始时间：** YYYY-MM-DD HH:mm
**参与者：** 张三、李四、新用户 1

---

[张三 00:01:23] 今天我们主要讨论方案选型的问题。
...
```

实现：`web/src/app/api/meetings/[id]/transcript.md/route.ts`

---

## 3. 下载 API

### 3.1 GET /api/meetings/[id]/transcript.md

见 §2.2。

### 3.2 GET /api/meetings/[id]/chat.md

下载本次会议的 AI 对话记录（来自 `meeting_chats` 表）。

```
GET /api/meetings/:id/chat.md
Response: text/markdown; charset=utf-8
Content-Disposition: attachment; filename="AI对话-<title>.md"

# AI 问答记录 — <title>

**时间：** YYYY-MM-DD HH:mm

---

**用户：** 帮我总结这次会议

**AI：**
## 会议总结
...

---

**用户：** 列出所有待办事项

**AI：**
- [ ] 张三负责输出技术文档
...
```

### 3.3 前端下载按钮

在会议详情页顶部工具栏增加两个按钮：

```tsx
<a href={`/api/meetings/${id}/transcript.md`} download>
  <Download className="w-3.5 h-3.5" /> 下载记录
</a>
<a href={`/api/meetings/${id}/chat.md`} download>
  <Download className="w-3.5 h-3.5" /> 下载对话
</a>
```

---

## 4. meeting_chats 表 Schema

```sql
CREATE TABLE IF NOT EXISTS meeting_chats (
  id          TEXT PRIMARY KEY,
  meeting_id  TEXT NOT NULL,
  role        TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (meeting_id) REFERENCES meetings(id)
);
CREATE INDEX IF NOT EXISTS idx_mc_meeting ON meeting_chats(meeting_id);
```

`db.ts` 中新增：
- `initDb()` 加入 `meeting_chats` 建表语句
- 新增 `saveChatMessage(meetingId, role, content)` helper
- 新增 `getChatMessages(meetingId)` → `ChatMessage[]`

---

## 5. POST /api/meetings/[id]/chat SSE 设计

### 5.1 请求

```
POST /api/meetings/:id/chat
Content-Type: application/json
Body: {
  "message": "帮我总结这次会议",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
Response: text/event-stream
```

### 5.2 SSE 事件序列

```
event: text_delta
data: {"text": "## 会议总结\n\n"}

event: text_delta
data: {"text": "**参与者：** 张三、李四\n"}

event: tool_use
data: {"name": "get_meeting_transcript", "input": {"meeting_id": "xxx"}}

event: tool_result
data: {"name": "get_meeting_transcript", "result": {...}}

event: done
data: {"fullText": "## 会议总结\n\n..."}
```

### 5.3 路由实现

文件：`web/src/app/api/meetings/[id]/chat/route.ts`

```typescript
export async function POST(req, { params }) {
  const { message, history } = await req.json();
  const meetingId = params.id;

  // 1. 持久化用户消息
  saveChatMessage(meetingId, "user", message);

  // 2. 构建带历史的 prompt
  const fullPrompt = buildPromptWithHistory(history, message, meetingId);

  // 3. 复用 runSummaryAgent 的 Agent 逻辑（新函数 runChatAgent）
  //    差异：prompt 包含对话历史；Agent 感知多轮上下文
  const stream = runChatAgent(meetingId, fullPrompt);

  // 4. SSE 流式转发
  // 5. done 事件触发后持久化 assistant 消息
}
```

### 5.4 agent.ts 新增 runChatAgent

`runChatAgent(meetingId, prompt)` 与 `runSummaryAgent` 共用同一套 MCP 工具，差别仅在 prompt。

---

## 6. Settings 重构（核心）

### 6.1 设计原则

现有 Settings 页把 ASR key + Agent key + model + system prompt 混在一起，随着功能增加越来越难维护。R11 改为**按功能拆块**：

| 功能块 | 包含配置 | 测试按钮 |
|--------|---------|---------|
| ASR (语音识别) | DashScope API Key、WebSocket URL | 测试 ASR 连接 |
| Agent (AI 问答) | API Key、Base URL、Model、System Prompt | 测试 Agent 连通性 |
| Voiceprint (声纹) | 服务 URL（默认 http://localhost:4929） | 测试声纹服务健康 |

### 6.2 DB Key 命名迁移

| 旧 key（R10） | 新 key（R11） | 说明 |
|--------------|--------------|------|
| `anthropic_api_key` | `agent_api_key` | 功能语义，不绑定到 Anthropic |
| `anthropic_base_url` | `agent_base_url` | 同上 |
| `anthropic_model` | `agent_model` | 同上（已是 agent_model，不变） |
| `agent_system_prompt` | `agent_system_prompt` | 不变 |
| `dashscope_api_key` | `asr_api_key` | 功能语义 |
| *(新增)* | `asr_ws_url` | ASR WebSocket URL，默认 wss://dashscope.aliyuncs.com/api-ws/v1/inference |
| *(新增)* | `voiceprint_url` | 声纹服务 URL，默认 http://localhost:4929 |

**迁移策略**（向后兼容）：
- `getSetting("agent_api_key")` 读不到时，fallback 读 `getSetting("anthropic_api_key")`
- `getSetting("asr_api_key")` 读不到时，fallback 读 `getSetting("dashscope_api_key")`
- 用户第一次打开新 Settings 页保存后，写入新 key；旧 key 保留不删（不强制迁移）
- `agent.ts` `getAgentEnv()` 改为读 `agent_api_key`（带 fallback）

### 6.3 新增 /api/asr/ping 端点

```
POST /api/asr/ping
Response: { ok: boolean, latencyMs?: number, error?: string }
```

实现：用 `asr_api_key` 建立一次 DashScope WebSocket 握手，握手成功即返回 ok。

### 6.4 /api/voiceprint-health 已有

现有 `GET /api/voiceprint-health` 直接复用，Settings 页调用即可。

### 6.5 新 Settings 页 UI 草图

```
┌─────────────────────────────────────────────────────────────┐
│  ⚙  设置                                                     │
├─────────────────────────────────────────────────────────────┤
│  ## ASR (语音识别)                                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  DashScope API Key  [已配置 ●]                        │   │
│  │  ┌────────────────────────────────────────────────┐  │   │
│  │  │ 输入新 key 以替换（留空保持不变）                │  │   │
│  │  └────────────────────────────────────────────────┘  │   │
│  │  WebSocket URL                                        │   │
│  │  ┌────────────────────────────────────────────────┐  │   │
│  │  │ wss://dashscope.aliyuncs.com/api-ws/v1/...     │  │   │
│  │  └────────────────────────────────────────────────┘  │   │
│  │                          [保存 ASR 配置]  [测试连接]   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ## Agent (AI 问答)                                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  API Key  [已配置 ●]                                  │   │
│  │  Provider: [Anthropic 官方] [云雾中转] [自定义]       │   │
│  │  Base URL: [https://api.anthropic.com              ]  │   │
│  │  模型:     [claude-sonnet-4-5-20250929           ▾]   │   │
│  │  System Prompt:                                       │   │
│  │  ┌────────────────────────────────────────────────┐  │   │
│  │  │ 你是一个专业的会议记录分析助手...               │  │   │
│  │  └────────────────────────────────────────────────┘  │   │
│  │                    [保存 Agent 配置]  [测试连通性]     │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ## Voiceprint (声纹服务)                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  服务 URL                                             │   │
│  │  ┌────────────────────────────────────────────────┐  │   │
│  │  │ http://localhost:4929                           │  │   │
│  │  └────────────────────────────────────────────────┘  │   │
│  │                                [保存]  [测试声纹服务]  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. 文件清单

### 新增

| 文件 | 内容 |
|------|------|
| `web/src/app/api/meetings/[id]/transcript.md/route.ts` | GET 会议文字记录 Markdown 下载 |
| `web/src/app/api/meetings/[id]/chat.md/route.ts` | GET AI 对话记录 Markdown 下载 |
| `web/src/app/api/meetings/[id]/chat/route.ts` | POST chat SSE（多轮 AI 问答） |
| `web/src/app/api/asr/ping/route.ts` | POST ASR 连通性测试 |

### 修改

| 文件 | 改动 |
|------|------|
| `web/src/lib/db.ts` | 新增 `meeting_chats` 表建表 + `saveChatMessage` / `getChatMessages` helpers |
| `web/src/lib/agent.ts` | 新增 `runChatAgent(meetingId, prompt)` + `getAgentEnv()` 读 `agent_api_key` (fallback) |
| `web/src/app/meetings/[id]/page.tsx` | AI 总结面板 → AI 问答 Chat 面板；推荐 prompt chips；两个下载按钮 |
| `web/src/app/settings/page.tsx` | 按功能重构为 ASR / Agent / Voiceprint 三块，各自保存+测试按钮 |

---

## 8. 验收清单

- [ ] R11-1: 会议详情页显示「AI 问答」区域，顶部有 4 个推荐 prompt chips
- [ ] R11-2: 点击推荐 chip，自动填入输入框并发送，AI 流式回复
- [ ] R11-3: 用户可在输入框手动输入问题发送，支持多轮对话（AI 感知上下文）
- [ ] R11-4: 会议发言流中每条记录显示格式为 `[角色名 hh:mm:ss] 文字`
- [ ] R11-5: 点击「下载记录」按钮，浏览器下载 `会议记录-<title>.md`，内容含完整角色绑定格式
- [ ] R11-6: 点击「下载对话」按钮，浏览器下载 `AI对话-<title>.md`，内容为完整多轮问答
- [ ] R11-7: 对话历史持久化到 `meeting_chats` 表，刷新页面后 chat 历史仍存在
- [ ] R11-8: Settings 页显示三个独立功能块（ASR / Agent / Voiceprint），各有独立保存按钮
- [ ] R11-9: Settings > ASR 块「测试连接」按钮，返回连通结果（成功或失败原因）
- [ ] R11-10: Settings > Agent 块「测试连通性」按钮，功能与 R10 的「测试连通性」一致
- [ ] R11-11: Settings > Voiceprint 块「测试声纹服务」按钮，调用 `/api/voiceprint-health` 并展示结果
- [ ] R11-12: 旧 settings key（`anthropic_api_key` / `dashscope_api_key`）在 DB 中存在时，新代码读取正确（向后兼容）
- [ ] R11-13: `agent.ts` `getAgentEnv()` 读 `agent_api_key`，fallback 到 `anthropic_api_key`，功能正常

---

## 9. 风险与回退

| 风险 | 概率 | 回退/缓解 |
|------|------|----------|
| chat 多轮上下文 token 开销大 | 中 | history 只保留最近 6 条消息（3 轮）；transcript 压缩为前 100 字 |
| ASR ping 用 WebSocket 握手失败（防火墙） | 中 | 降级为 HTTP 方式验证 DashScope key 有效性（调用 REST API） |
| DB key 迁移导致旧配置失效 | 低 | `getSetting` 带双 key fallback；不删除旧 key |
| 文件名含中文导致 Content-Disposition 乱码 | 低 | `encodeURIComponent` 编码文件名，遵循 RFC 5987 |
| `meeting_chats` 表新增与现有 HMR 单例冲突 | 低 | `initDb()` 用 `CREATE TABLE IF NOT EXISTS`，HMR 重载不重复建表 |
