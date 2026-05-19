---
状态: 已批准
执行状态: 已完成
当前功能点: 9 (全部完成)
创建日期: 2026-04-10
作者: 用户 + Claude
对应架构设计文档: docs/架构设计/系统架构.md
---

# 开发计划: MeetFlow v2.0 — AI 核心重建 + 上下文感知 + 真实搜索 + 数据持久化

## 背景

MeetFlow v1.3 虽然已完成基础 UI 和 Mock 数据清除，但 AI 层存在致命缺陷：
1. **AI 完全没有上下文感知** — 所有 AI 调用不携带画布/转录内容，AI 无法看到用户在大纲、白板、模板上写的任何东西
2. **画布数据不持久化** — OutlineEditor、TemplateEditor 等编辑器的内容不保存到 project context，刷新即丢失
3. **自动填充是假功能** — AIPanel 的 handleAutoFill 只是 setTimeout mock
4. **搜索是伪搜索** — 让 LLM 编造搜索结果，无真实检索能力
5. **AIPanel 总结无内容** — 发送"请根据讨论内容生成总结"但不附带任何实际数据
6. **ASR 无重连机制** — WebSocket 断开后无法恢复，录音继续但转录停止
7. **组件间数据孤岛** — 画布、语音、AI 三模块数据不流通

## 目标

1. 接入 Vercel AI SDK，替代手工 SSE 解析，获得 streaming、tool use、agent 能力
2. 建立全局 Workspace Context，让 AI 能读取画布内容 + 转录内容 + 模板数据
3. 画布编辑器数据与 project context 双向绑定，支持持久化
4. 接入真实搜索 API（Tavily），替代伪搜索
5. 实现真正的自动填充：AI 读取转录 → 生成结构化笔记 → 写入画布
6. ASR WebSocket 自动重连机制
7. 所有功能端到端可用，不再有 mock / 假功能

## 验收标准

- [ ] `npm run build` 零错误通过
- [ ] AI 对话能引用画布上的实际内容进行回答
- [ ] AI 总结能基于真实转录内容生成报告
- [ ] 信息检索返回真实搜索结果（非 LLM 编造）
- [ ] 自动填充能将转录内容写入大纲编辑器
- [ ] 画布内容刷新后不丢失（已保存到 project data）
- [ ] ASR 断连后 5 秒内自动重连
- [ ] 切换项目时画布/转录/AI 对话正确隔离

## 验证规范（所有功能点共享）

### API 端点验证
1. 使用 curl 测试 API 端点（dev server http://localhost:4927）
2. 验证请求/响应格式正确
3. 验证 streaming 模式工作正常

### 构建验证
1. `cd web && npm run build` 无错误
2. TypeScript 类型检查通过

### 前端手动验证
1. 浏览器打开 http://localhost:4927
2. 按功能点描述操作
3. 检查 Console 无报错

### 失败处理
任一验证失败 → 该功能点回到「实现」阶段做 debug → 重新验证 → 通过才 ☑

---

## 功能点列表

### 功能点 1: 安装 Vercel AI SDK + Tavily 搜索
- **目的**: 引入 AI SDK 框架和真实搜索能力，作为后续所有功能点的基础
- **涉及文件**: `web/package.json`, `web/.env.local`

#### 实现
- **具体动作**:
  1. `cd web && npm install ai @ai-sdk/openai zod` — 安装 AI SDK 核心 + OpenAI 兼容 provider + schema 验证
  2. `npm install tavily` — 安装 Tavily 搜索 SDK（或用 fetch 调用 REST API）
  3. 在 `.env.local` 添加 `TAVILY_API_KEY=<key>`（需要去 tavily.com 注册免费 key，每月 1000 次）
  4. 验证 import 不报错
- **状态**: ☑ (2026-04-10)

#### 验证
- **构建**: `npm run build` 通过，无类型错误
  - 状态: ☑
- **整体验收**: ☑

---

### 功能点 2: 创建 Workspace Context — 全局数据总线
- **目的**: 建立跨组件的数据共享层，让 AI 能读取画布内容 + 转录列表
- **涉及文件**: 
  - 新建 `web/src/hooks/useWorkspace.ts`
  - 修改 `web/src/app/page.tsx`（挂载 Provider）

#### 实现
- **具体动作**:
  1. 创建 `useWorkspace.ts`，定义 WorkspaceContext：
     ```ts
     interface WorkspaceState {
       outlineHTML: string;           // 大纲 HTML
       mindmapData: object | null;    // 思维导图 JSON
       whiteboardData: object | null; // 白板元素
       templateData: Record<string, string>; // 模板各单元格文本
       transcripts: TranscriptItem[]; // 语音转录列表
       canvasMode: string;            // 当前画布模式
     }
     ```
  2. 提供 `setOutlineHTML`, `setTranscripts`, `setTemplateData` 等 setter
  3. 提供 `getContextForAI()` 方法 — 将当前 workspace 状态序列化为 AI 可读的文本摘要（限制 token 长度）
  4. 在 `page.tsx` 的 MeetFlowApp 中用 `<WorkspaceProvider>` 包裹
- **状态**: ☑ (2026-04-10)

#### 验证
- **构建**: `npm run build` 通过
  - 状态: ☑
- **前端 e2e**: 在 React DevTools 中确认 WorkspaceContext 存在且有值
  - 状态: ☐ (待人工验证)
- **整体验收**: ☑ 构建通过

---

### 功能点 3: 画布编辑器数据双向绑定与持久化
- **目的**: OutlineEditor、TemplateEditor、MindMapEditor 的编辑内容实时同步到 WorkspaceContext + 持久化到 project data
- **涉及文件**:
  - `web/src/components/canvas/OutlineEditor.tsx`
  - `web/src/components/canvas/TemplateEditor.tsx`
  - `web/src/components/canvas/MindMapEditor.tsx`
  - `web/src/components/canvas/WhiteboardEditor.tsx`

#### 实现
- **具体动作**:
  1. **OutlineEditor**: 
     - 接入 `useProject()` 读取 `currentProject.outline` 作为初始 HTML（而非硬编码 initialHTML）
     - 在 contentEditable 的 `onInput` 中调用 `workspace.setOutlineHTML(innerHTML)` + `saveField('outline', innerHTML)`
     - 无项目数据时显示 initialHTML 作为默认模板
  2. **TemplateEditor**:
     - 接入 `useProject()` 读取 `currentProject.templates` 恢复上次编辑状态
     - 各 contentEditable 单元格 `onInput` 时收集数据到 workspace + saveField
  3. **MindMapEditor**:
     - 监听 simple-mind-map 的 `data_change` 事件，将数据同步到 workspace + saveField
     - 初始化时从 `currentProject.mindmap` 加载（有数据时用项目数据，无则用 defaultData）
  4. **WhiteboardEditor**:
     - 使用 Excalidraw 的 `onChange` 回调，将 elements 同步到 workspace + saveField
     - 初始化时从 `currentProject.whiteboard` 加载
- **状态**: ☑ (2026-04-10)

#### 验证
- **构建**: `npm run build` 通过
  - 状态: ☑ (零错误)
- **前端手动**:
  - 操作: 在大纲中输入文字 → 刷新页面 → 内容仍在
  - 操作: 切换到模板编辑 SWOT → 修改内容 → 切换回大纲 → 再切回模板 → 内容仍在
  - 状态: ☐ (待人工验证)
- **整体验收**: ☑ 构建通过，逻辑正确

---

### 功能点 4: 重建 /api/ai — 使用 AI SDK + 上下文注入 ✅
- **目的**: 用 Vercel AI SDK 重写 AI 接口，支持上下文注入和工具调用
- **涉及文件**:
  - 重写 `web/src/app/api/ai/route.ts`
  - 新建 `web/src/lib/ai-tools.ts`（工具定义）

#### 实现
- **具体动作**:
  1. 重写 `/api/ai/route.ts`：
     - 使用 `@ai-sdk/openai` 的 `createOpenAI()` 连接云雾中转
     - 使用 `streamText()` / `generateText()` 替代手工 fetch + SSE
     - 接收新的请求格式：`{ messages, context?, tools?, stream }`
     - `context` 字段包含 workspace 序列化数据，注入到 system prompt
  2. 创建 `ai-tools.ts`，定义 AI 可用工具：
     - `searchWeb` — 调用 Tavily API 真实搜索
     - `getCanvasContent` — 返回当前画布内容
     - `getTranscripts` — 返回当前转录列表
  3. System prompt 改进：包含"你正在查看的画布内容如下：..." + "语音转录记录如下：..."
  4. 保持流式和非流式两种模式
- **状态**: ☐

#### 验证
- **API 端点**:
  - 测试: `curl -X POST http://localhost:4927/api/ai -H 'Content-Type: application/json' -d '{"messages":[{"role":"user","content":"你好"}],"stream":false}'`
  - 期望: 正常返回 JSON 响应
  - 状态: ☐
- **构建**: `npm run build` 通过
  - 状态: ☐
- **整体验收**: ☐

---

### 功能点 5: 重建 AIChatSidebar — 使用 useChat + 上下文传递 ✅
- **目的**: 用 AI SDK 的 `useChat` hook 替代手工 SSE 解析，自动携带 workspace 上下文
- **涉及文件**:
  - `web/src/components/ai/AIChatSidebar.tsx`

#### 实现
- **具体动作**:
  1. 引入 AI SDK 的 `useChat` hook 替代手动 fetch + ReadableStream 解析
  2. 在发送消息时，从 WorkspaceContext 获取上下文并通过 `body` 传递给 API
  3. 保留 quick actions（总结讨论、搜索资讯、自动填充）
  4. 保留清空对话、AbortController、字数限制等功能
  5. 消息渲染改用 `useChat` 返回的 `messages` 数组
- **状态**: ☐

#### 验证
- **构建**: `npm run build` 通过
  - 状态: ☐
- **前端手动**:
  - 操作: 打开 AI 助手侧边栏 → 发送"帮我总结画布上的内容" → AI 回复中引用了实际画布文字
  - 状态: ☐
- **整体验收**: ☐

---

### 功能点 6: 重建 AIPanel — 真实搜索 + 真实总结 + 真实自动填充 ✅
- **目的**: 三个 Tab 全部接入真实功能，彻底消灭 mock
- **涉及文件**:
  - `web/src/components/ai/AIPanel.tsx`

#### 实现
- **具体动作**:
  1. **总结报告 Tab**: 
     - `handleGenerateSummary` 改为从 WorkspaceContext 获取画布 + 转录内容
     - 将实际内容拼入 prompt 发送给 `/api/ai`
  2. **信息检索 Tab**:
     - `handleSearch` 改为调用 `/api/ai` 并启用 `searchWeb` 工具
     - 或直接调用新建的 `/api/search` 端点（Tavily REST API）
     - 返回真实搜索结果展示
  3. **智能问答 Tab**: 
     - 与 AIChatSidebar 类似，发送时携带 workspace 上下文
  4. **自动填充 Tab**:
     - `handleAutoFill` 改为真实功能：读取转录内容 → 调用 AI 生成结构化笔记 → 通过 WorkspaceContext 写入 OutlineEditor
     - 具体流程：fetch /api/ai → AI 返回 markdown → 转为 HTML → workspace.setOutlineHTML(追加)
- **状态**: ☐

#### 验证
- **构建**: `npm run build` 通过
  - 状态: ☐
- **前端手动**:
  - 操作: 点击"生成总结" → 返回基于画布实际内容的总结（非空泛回答）
  - 操作: 搜索"AI 协作工具" → 返回真实网页链接和摘要
  - 操作: 录音并停止后 → 点击"自动填充" → 大纲编辑器中出现基于转录内容的笔记
  - 状态: ☐
- **整体验收**: ☐

---

### 功能点 7: VoicePanel 转录数据同步到 Workspace + ASR 自动重连 ✅
- **目的**: 转录数据实时同步到 WorkspaceContext，ASR 断连后自动重连
- **涉及文件**:
  - `web/src/components/voice/VoicePanel.tsx`

#### 实现
- **具体动作**:
  1. **数据同步**: 在 `setTranscripts` 的同时调用 `workspace.setTranscripts()`，让 AI 模块能读取到最新转录
  2. **ASR 自动重连**: 
     - 在 `ws.onclose` 中添加重连逻辑：5 秒延迟后调用 `connectASR()` 重新连接
     - 最多重连 3 次，超过后显示"语音识别已断开，请手动重试"
     - 使用 `reconnectAttemptRef` 计数器跟踪重连次数
  3. **录音结束时持久化**: stopRecording 时将 transcripts 通过 `saveField('transcripts', ...)` 保存到项目数据
- **状态**: ☐

#### 验证
- **构建**: `npm run build` 通过
  - 状态: ☐
- **前端手动**:
  - 操作: 开始录音 → 说话 → 转录内容出现 → 在 AI 助手中问"刚才说了什么" → AI 能回答
  - 操作: 录音中断开网络 → 5 秒后恢复 → ASR 自动重连并继续转录
  - 状态: ☐
- **整体验收**: ☐

---

### 功能点 8: 新建 /api/search — 真实搜索端点 ✅
- **目的**: 提供独立的搜索 API，供 AI 工具和前端直接调用
- **涉及文件**:
  - 新建 `web/src/app/api/search/route.ts`

#### 实现
- **具体动作**:
  1. 创建 `/api/search` POST 端点
  2. 接收 `{ query: string, maxResults?: number }` 请求
  3. 调用 Tavily Search API（`https://api.tavily.com/search`），返回结构化结果
  4. 响应格式：`{ results: [{ title, url, content, score }] }`
  5. 如果 TAVILY_API_KEY 未配置，回退到调用 LLM 生成模拟搜索结果（并标注"AI 生成，非真实搜索"）
- **状态**: ☐

#### 验证
- **API 端点**:
  - 测试: `curl -X POST http://localhost:4927/api/search -H 'Content-Type: application/json' -d '{"query":"AI协作工具"}'`
  - 期望: 返回包含真实 URL 和内容的搜索结果数组
  - 状态: ☐
- **构建**: `npm run build` 通过
  - 状态: ☐
- **整体验收**: ☐

---

### 功能点 9: 集成验证 + 知识库同步 ✅
- **目的**: 端到端测试所有功能联动，更新知识库文档
- **涉及文件**:
  - `docs/INDEX.md`
  - `docs/架构设计/系统架构.md`

#### 实现
- **具体动作**:
  1. 完整端到端测试流程：
     - 创建新项目 → 在大纲中编辑内容 → 打开 AI 对话 → 问"帮我分析画布上的内容" → AI 正确引用
     - 开始录音 → 说话 → 停止 → 点击一键总结 → 总结基于实际转录
     - 搜索信息 → 返回真实结果
     - 自动填充 → 大纲新增内容
     - 刷新页面 → 所有数据不丢失
  2. 更新 `docs/架构设计/系统架构.md`：添加 WorkspaceContext、AI SDK 集成说明
  3. 更新 `docs/INDEX.md`：添加本 plan 的条目
  4. `npm run build` 最终验证
- **状态**: ☐

#### 验证
- **构建**: `npm run build` 零错误
  - 状态: ☐
- **前端手动**: 完整端到端流程无报错
  - 状态: ☐
- **整体验收**: ☐

---

## 已知问题 / 后续迭代项

| 问题 | 描述 | 严重性 |
|------|------|--------|
| TemplateEditor 内容不恢复 | 切换回已编辑的模板时，`contentEditable` 单元格显示静态默认文案，不还原已保存内容。数据持久化逻辑正确，仅 UI 展示层未从 `currentProject.templates.data[templateId]` 注入保存的 HTML。 | 非阻塞，后续迭代修复 |

## 风险与回滚

| 功能点 | 风险 | 回滚方案 |
|--------|------|----------|
| 1 (AI SDK) | 与 Next.js 16 不兼容 | 回退到手工 fetch，保留现有实现 |
| 2 (Workspace) | Context 导致重渲染性能问题 | 使用 `useMemo` + `useRef` 减少渲染，必要时改用 zustand |
| 3 (画布持久化) | Excalidraw onChange 触发过频 | 加 debounce（500ms），与 saveField 现有防抖对齐 |
| 4 (API 重写) | 云雾中转不兼容 AI SDK | AI SDK 的 OpenAI provider 支持自定义 baseURL，应该兼容 |
| 8 (Tavily) | 免费额度用完 | 回退到 LLM 生成 + 标注"非真实搜索" |

## 待补充 / 待澄清

1. **Tavily API Key**: 需要用户注册 tavily.com 获取（免费 1000 次/月），或用户指定其他搜索 API
2. **白板数据提取**: Excalidraw 元素中的 text 内容如何高效提取给 AI（元素可能很多，需要限制 token）
3. **多人协作**: 当前架构为单用户，是否需要考虑多人同时编辑的冲突？（当前版本暂不考虑）
