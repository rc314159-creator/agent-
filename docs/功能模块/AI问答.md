---
title: AI 问答（Claude Agent SDK + MCP）
description: query() + createSdkMcpServer + 4 个 SQLite MCP 工具 + systemPrompt 注入跨会议 memory + meeting_chats 持久化 + 推荐 prompt chips
status: 已批准
created: 2026-05-20
updated: 2026-05-20
update_reason: R15 从系统架构.md 拆出来 + R9-R13 完整记录
related:
  - docs/自动化测试/AI问答.md
  - docs/功能模块/设置管理.md
---

# AI 问答

会议详情页右栏 chat 面板的实现。

## 一、技术栈

- `@anthropic-ai/claude-agent-sdk` ^0.3.145
- `zod` 校验 tool schema
- SSE 流式输出到前端
- SQLite `meeting_chats` 表持久化历史

## 二、Agent 配置

代码：`web/src/lib/agent.ts`

### Env 优先级（getAgentEnv）

| 字段 | 来源（按优先级） |
|------|--------|
| ANTHROPIC_API_KEY | settings.agent_api_key > env ANTHROPIC_API_KEY > env LLMMELON_API_KEY > settings.anthropic_api_key (旧) > env YUNWU_API_KEY |
| ANTHROPIC_BASE_URL | settings.agent_base_url > env ANTHROPIC_BASE_URL > env LLMMELON_BASE_URL > settings.anthropic_base_url > env YUNWU_BASE_URL |

baseURL 末尾 `/v1` 会被 strip（SDK 内部拼接）。

### Model 默认
`claude-haiku-4-5-20251001`（R12 起，从 sonnet 降级）

## 三、四个 MCP 工具

代码：`web/src/lib/agent.ts` `createMeetingMcpServer()` 用 `createSdkMcpServer + tool + zod`：

| 工具名（注册后变成 `mcp__meeting-db__<name>`） | 输入 | 用途 |
|---|---|---|
| `get_meeting_transcript` | meeting_id | 返回会议完整发言记录 markdown，**`[角色名 hh:mm:ss] text` 行格式**（关键：让 agent 直接看到角色名而非 ID） |
| `list_speakers` | (空) | 全部 speaker + sampleCount + lastSeen，用于"几个人发言"类问题 |
| `search_speaker_history` | speaker_id, limit | 这个 speaker 在所有会议的历史发言，跨会议追踪 |
| `search_past_meetings` | query, limit | 全文搜 utterances LIKE %query%，跨会议引用 |

`allowedTools` 严格白名单只这 4 个；`disallowedTools` 显式禁 `Bash/Edit/Write/Read/Glob/Grep`，防止 agent 乱跑命令。

## 四、跨会议 memory

代码：`web/src/lib/agent.ts` `loadPastSummaries(dataDir, limit=5)`

机制：
1. 每次 `runSummaryAgent` / `runChatAgent` 调 `query()` 前，读 `data/agent-memory/*.md` 最近 5 个文件
2. 拼成 `## 历史会议总结记忆` markdown 块
3. **塞到 SDK 的 `systemPrompt` option**（不是 user prompt——R12 worker-b 改对的关键点：user prompt 是低权威，systemPrompt 是高权威）
4. 总结生成完成后 `saveSummaryMemory(meetingId, markdown, dataDir)` 写 `data/agent-memory/meeting_<id>.md`

实测：第二次问"这个会议跟之前有关联吗" → AI 主动引用过往会议的说话人和议题。

## 五、Chat vs Summary 两个流

| 函数 | 触发 | 历史拼接 |
|------|------|---------|
| `runChatAgent(meetingId, userMessage)` | 用户输入 / 点 chip / 下载 chat.md 空时 | 最近 6 条 meeting_chats + 用户当前 message |
| `runSummaryAgent(meetingId)` | （R9 旧版唯一入口，R11 之后 chat 内嵌） | 仅 prompt + 系统 memory |

两个都 yield SummaryEvent (text_delta / tool_use / tool_result / done / error)，由 SSE route 透传给浏览器。

## 六、SSE 端点

代码：`web/src/app/api/meetings/[id]/chat/route.ts`

```ts
POST /api/meetings/[id]/chat  body: { message }
- saveChatMessage(id, "user", message)
- for await of runChatAgent(id, message): send(evt.type, evt.data)
- saveChatMessage(id, "assistant", assistantText)

GET /api/meetings/[id]/chat
- 返回 meeting_chats 历史列表
```

下载 `/api/meetings/[id]/chat.md`（R13）：空历史时自动触发一次默认总结，写库后导出 markdown。

## 七、UI

代码：`web/src/app/meetings/[id]/page.tsx`

- 双栏布局：左 utterance 时间线 / 右 chat
- 输入框 + 发送按钮 + 「显示推荐问题」disclosure
- 4 个推荐 chip：「帮我总结这次会议」「列出所有待办事项」「分析各人发言」「关键决策」点 = 直接发送（不填入框）
- tool_use 折叠条 `> mcp__meeting-db__<name>`，点开看 input
- assistant 消息 Markdown 渲染（react-markdown）

## 八、关联

- 配置（key/url/model）→ [设置管理](设置管理.md)
- 测试用例 → [自动化测试/AI问答](../自动化测试/AI问答.md)
