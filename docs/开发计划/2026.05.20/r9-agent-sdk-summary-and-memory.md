---
title: R9 — Claude Agent SDK 接入 + 会议总结 + 跨会议 memory
状态: 待实现
创建日期: 2026-05-20
---

# R9 — Claude Agent SDK 接入 + 会议总结 + 跨会议 memory

## 背景与目标

用户原话（需求出处）：
> "起那段新增加对每个会议的总结分析的功能，并且可以结合历史会议声纹角色，得到更好的总结，也就是说要有一个历史 memory 和跨 session 检索对话历史的能力，这个我觉得都直接使用 claude code agent sdk 即可"

目标：
1. 每次会议结束后，Agent 自动生成结构化总结（议题、结论、待办、发言人分析）
2. Agent 持有跨会议 memory：知道"张三"是谁、历史讨论了什么、上次遗留了什么
3. 用户可在会议详情页触发"重新总结"，并在总结气泡中看到流式输出
4. 所有 Agent 工具和 system prompt 可在 `/settings` 页配置（与 R10 联动）

---

## 架构决策

### 使用 `@anthropic-ai/claude-agent-sdk`

- Agent SDK 提供 tool calling loop、memory 目录、跨 session 上下文管理
- 不自己实现 ReAct 循环，直接用 SDK 的 `Agent.run()`
- API key 和 model 从 SQLite `settings` 表读取（R10 实现），fallback 到环境变量 `ANTHROPIC_API_KEY`

### Memory 目录

- 路径：`data/agent-memory/`（与 `data/vp.db` 同级）
- 内容：声纹角色背景（"张三是产品经理，常提需求优先级问题"）+ 历史会议摘要索引
- SDK memory 格式：遵循 `@anthropic-ai/claude-agent-sdk` 的 `MemoryManager` 约定（文件名 `user_*.md`, `project_*.md`, `feedback_*.md`）

### 4 个 Agent Tools

| Tool | 作用 |
|------|------|
| `get_meeting_utterances` | 取某次会议所有 utterance（含 speakerName + text + startMs） |
| `get_speaker_history` | 取某 speaker 跨会议的历史发言摘要 |
| `search_past_meetings` | 按关键词全文搜索历史 utterance |
| `save_meeting_note` | 把总结结果写入 `meeting_summaries` 表（持久化） |

---

## 数据库变更

### 新增表 `meeting_summaries`

```sql
CREATE TABLE IF NOT EXISTS meeting_summaries (
  id           TEXT PRIMARY KEY,
  meeting_id   TEXT NOT NULL UNIQUE,
  summary_md   TEXT NOT NULL,          -- Markdown 格式总结
  generated_at INTEGER NOT NULL,
  model        TEXT,                   -- 记录用哪个 model 生成的
  prompt_tokens INTEGER,
  output_tokens INTEGER,
  FOREIGN KEY (meeting_id) REFERENCES meetings(id)
);
```

### 新增 `settings` 表（由 R10 实际建，R9 读取）

```sql
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- 预期 key：anthropic_api_key, agent_model, agent_system_prompt, dashscope_api_key
```

R9 在 `db.ts` 中增加 `getDb().getSetting(key)` helper，如果 R10 尚未实现则 fallback 到 `process.env`。

---

## API 设计

### POST /api/meetings/[id]/summarize

触发（或重新触发）对某次会议的 Agent 总结。响应为 SSE 流式输出。

```
POST /api/meetings/:id/summarize
Response: text/event-stream

事件格式：
event: text_delta
data: {"delta": "## 会议总结\n\n**参与者：**"}

event: tool_use
data: {"tool": "get_meeting_utterances", "input": {"meetingId": "xxx"}}

event: tool_result
data: {"tool": "get_meeting_utterances", "result_preview": "47 utterances loaded"}

event: done
data: {"summaryId": "yyy", "totalTokens": 1234}

event: error
data: {"message": "API key not configured"}
```

### GET /api/meetings/[id]/summary

取已存储的总结（如果存在）。

```
GET /api/meetings/:id/summary
Response: {
  "exists": true,
  "summaryId": "xxx",
  "summaryMd": "## 会议总结\n...",
  "generatedAt": 1716200000,
  "model": "claude-opus-4-7"
}
```

---

## Agent 实现细节

### Agent 入口：`web/src/lib/meeting-agent.ts`

```typescript
import Anthropic from "@anthropic-ai/sdk";

const TOOLS = [
  {
    name: "get_meeting_utterances",
    description: "获取指定会议的所有发言记录，含说话人姓名和时间戳",
    input_schema: {
      type: "object",
      properties: {
        meetingId: { type: "string" }
      },
      required: ["meetingId"]
    }
  },
  {
    name: "get_speaker_history",
    description: "获取某个声纹角色在历史会议中的发言摘要，用于理解该人物背景",
    input_schema: {
      type: "object",
      properties: {
        speakerId: { type: "string" },
        limit: { type: "number", description: "最多返回最近 N 次会议，默认 5" }
      },
      required: ["speakerId"]
    }
  },
  {
    name: "search_past_meetings",
    description: "按关键词搜索历史会议发言，支持议题追踪",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number", description: "默认 20" }
      },
      required: ["query"]
    }
  },
  {
    name: "save_meeting_note",
    description: "将生成的会议总结保存到数据库",
    input_schema: {
      type: "object",
      properties: {
        meetingId: { type: "string" },
        summaryMd: { type: "string" }
      },
      required: ["meetingId", "summaryMd"]
    }
  }
];

export async function* runSummaryAgent(
  meetingId: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
): AsyncGenerator<SummaryEvent>
```

### Tool 执行器（同文件）

每个 tool call 由 `executeTool(toolName, input, db)` 分派：

- `get_meeting_utterances`：`SELECT u.*, s.name FROM utterances u JOIN speakers s ON u.speaker_id=s.id WHERE meeting_id=? ORDER BY start_ms`
- `get_speaker_history`：取该 speaker 在最近 N 次会议中的 utterance，按会议分组返回摘要
- `search_past_meetings`：`SELECT u.text, s.name, m.title FROM utterances u JOIN speakers s ... WHERE u.text LIKE ?`（SQLite FTS 优化可后续加）
- `save_meeting_note`：`INSERT OR REPLACE INTO meeting_summaries ...`

### Memory 目录加载

在 Agent system prompt 中注入 memory 内容：

```typescript
const memoryDir = path.join(DATA_DIR, "agent-memory");
const memories = loadMemoryDir(memoryDir); // 读取所有 *.md 文件
const systemPromptWithMemory = systemPrompt + "\n\n## 关于参会者的已知信息\n" + memories;
```

新增 tool `save_speaker_note` 可选，让 Agent 在总结时顺手更新 memory（后续迭代）。

---

## 文件清单

### 新增

| 文件 | 内容 |
|------|------|
| `web/src/lib/meeting-agent.ts` | Agent 主逻辑：工具定义 + tool executor + 流式 generator |
| `web/src/lib/memory-loader.ts` | 读 `data/agent-memory/*.md` 拼接到 system prompt |
| `web/src/app/api/meetings/[id]/summarize/route.ts` | SSE endpoint，调 `runSummaryAgent` |
| `web/src/app/api/meetings/[id]/summary/route.ts` | GET 已存储的总结 |
| `web/src/components/MeetingSummary.tsx` | 展示总结的 UI 组件（Markdown 渲染 + 流式追加） |

### 修改

| 文件 | 改动 |
|------|------|
| `web/src/lib/db.ts` | 新增 `meeting_summaries` 表建表 + `getSetting` helper |
| `web/src/app/meetings/[id]/page.tsx` | 右侧加"总结"面板：GET summary + 触发 summarize 按钮 + 流式展示 |

---

## UI 草图

### 会议详情页（含总结面板）

```
┌───────────────────────────────────────────────────────┐
│  ← 会议 2026-05-20 15:30   [重新生成总结]              │
├────────────────────────────┬──────────────────────────┤
│  对话流                    │  会议总结                 │
│                            │                          │
│  张三 15:30:12             │  ## 议题                 │
│    "今天讨论..."           │  - 方案 A vs B 选型      │
│                            │                          │
│  李四 15:30:45             │  ## 结论                 │
│    "A 方案更好"            │  决定采用方案 A           │
│                            │                          │
│  张三 15:31:02             │  ## 待办                 │
│    "好，那就 A"            │  - [ ] 张三 输出技术文档 │
│                            │                          │
│                            │  ## 发言人分析           │
│                            │  张三（主导）: 提方案、  │
│                            │  收尾决策                │
│                            │  李四（支持）: 补充细节  │
└────────────────────────────┴──────────────────────────┘
```

### 流式生成时

```
│  会议总结             [生成中...]    │
│  ─────────────────────────────────  │
│  🔧 get_meeting_utterances...        │
│  🔧 get_speaker_history (张三)...    │
│  ## 议题                             │
│  - 方案 A vs B▌                      │
```

---

## 默认 System Prompt

```
你是一个专业的会议记录分析助手。你能访问会议的完整发言记录和参与者历史信息。

请生成结构化会议总结，包含：
1. 核心议题（bullet points）
2. 主要结论和决策
3. 待办事项（带负责人）
4. 各发言人的角色和贡献简析
5. 与历史会议的关联（如有）

使用简洁的中文，避免冗余。如果某个参与者在历史记录中有背景信息，请结合使用。
```

---

## 验收清单

- [ ] R9-1: 会议详情页右侧出现"总结"面板，包含"生成总结"按钮
- [ ] R9-2: 点击"生成总结"后，SSE 流式展示 tool 调用过程和文字输出
- [ ] R9-3: 总结完成后内容持久化到 DB，刷新页面仍可看到
- [ ] R9-4: Agent 调用了 `get_meeting_utterances` tool（SSE 中可见 tool_use 事件）
- [ ] R9-5: 当 `data/agent-memory/` 下有角色备注文件时，总结中体现该信息
- [ ] R9-6: API key 未配置时，页面显示友好错误提示，引导用户去 `/settings`
- [ ] R9-7: "重新生成总结"按钮可触发新一轮 Agent 运行，覆盖旧总结
- [ ] R9-8: Agent 跨会议 search（`search_past_meetings`）在总结中引用历史会议内容

---

## 风险与回退

| 风险 | 概率 | 回退 |
|------|------|------|
| `@anthropic-ai/claude-agent-sdk` 包名/API 与 Anthropic SDK 不同 | 中 | 使用 `@anthropic-ai/sdk` 直接实现 tool calling loop，不依赖 Agent SDK 封装 |
| Agent 总结 token 开销大（长会议 47 句 × 500 chars） | 中 | 先 summarize utterances（每段截 100 字），再喂给 Agent |
| SSE 流与 R8 SSE 冲突（同一个 meetings/[id] 页面） | 低 | 两个 SSE 用不同 URL，前端并行维护两个 EventSource |
| Agent memory 目录权限 | 低 | `fs.mkdirSync(memoryDir, { recursive: true })` 自动创建 |
