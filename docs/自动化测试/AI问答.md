# AI 问答测试

## 功能描述

会议详情页右栏 chat 面板：用户多轮提问，AI 用 Claude Agent SDK + 4 个 MCP 工具回答；4 个推荐 prompt chip 点击即发送；历史持久化到 `meeting_chats`；跨会议 memory 自动注入 system prompt。

## 代码路径

| 组件 | 路径 |
|------|------|
| 详情页（chat UI） | `web/src/app/meetings/[id]/page.tsx` |
| Chat POST + history GET | `web/src/app/api/meetings/[id]/chat/route.ts` |
| Chat agent | `web/src/lib/agent.ts` `runChatAgent()` |
| Summary agent | `web/src/lib/agent.ts` `runSummaryAgent()` |
| MCP server + 4 tools | `web/src/lib/agent.ts` `createMeetingMcpServer()` |
| Memory 落盘/加载 | `web/src/lib/agent.ts` `saveSummaryMemory` / `loadPastSummaries` |
| meeting_chats schema | `web/src/lib/db.ts` |
| Memory 目录 | `data/agent-memory/meeting_<id>.md` |

## 测试用例

### TC-问答-01：chat 面板渲染

**步骤：** 进有 utterance 的会议详情页

**期望：**
- 右栏「💬 AI 问答」标题
- 输入框「输入问题…（Enter 发送，Shift+Enter 换行）」
- 「显示推荐问题」按钮
- 已有历史会显示

### TC-问答-02：推荐 prompt chips

**步骤：** 点「显示推荐问题」

**期望：**
- 4 个 chip 横排显示：「帮我总结这次会议」「列出所有待办事项」「分析各人发言」「关键决策」
- 点 chip = 立即发送该 prompt 作为 user message（**不是**填入输入框）

### TC-问答-03：SSE 流式 + tool_use 折叠

**步骤：** 点「关键决策」chip

**期望：**
- 用户消息立即显示（紫色右对齐气泡）
- 看到 tool_use 折叠条：`> mcp__meeting-db__get_meeting_transcript`
- 1-3 秒内 AI 回复流式追加（左对齐 + Markdown 渲染）
- 完成后 `event: done` 触发，输入框重新可用

### TC-问答-04：角色名绑定（关键）

**步骤：** 问「这次会议谁说话最多？」

**期望：**
- AI 回答里**有明确的角色名**（如「张三」），不是「说话人 1」
- 因为 `getMeetingTranscriptImpl` 返回的是 `[张三 hh:mm:ss] text` markdown 行格式，agent 看到天然带角色

**失败排查：**
- AI 用 ID 而非名字 = `getMeetingTranscriptImpl` 还是返回 JSON，未升级到 markdown 行

### TC-问答-05：跨会议 memory

**前提：** `data/agent-memory/` 有至少一个 `meeting_*.md`

**步骤：** 进第二个会议详情页 → 问「这次会议跟之前的会议有什么关联」

**期望：**
- AI 回答**显式引用过往会议的内容**（参与者、议题、决策等）
- 因为 `runSummaryAgent`/`runChatAgent` 加载 `loadPastSummaries(dataDir, 5)` 拼到 `systemPrompt`
- 不是凭空编造，能对应到 memory 文件实际内容

### TC-问答-06：多轮上下文

**步骤：**
1. 问「这次会议有几个人发言？」→ 回复 N
2. 接着问「他们各自说了什么？」（不显式提"他们"指代）

**期望：**
- AI 理解「他们」= 上一轮的 N 个发言人
- `runChatAgent` 把最近 6 条历史拼进 prompt 作为上下文

### TC-问答-07：持久化

**步骤：** 提问后刷新页面

**期望：**
- chat 面板加载历史（GET /api/meetings/[id]/chat）
- 所有 user + assistant 消息恢复，顺序正确
- sqlite3 `data/vp.db` `SELECT COUNT(*) FROM meeting_chats WHERE meeting_id='...'` 与 UI 数一致
