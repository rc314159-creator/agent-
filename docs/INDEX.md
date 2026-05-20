# 会议记录工具 — 知识库索引

> 本文件是知识库的**唯一入口**。Agent 和开发者都从这里开始导航，按需逐层加载。
>
> 最后更新：**2026-05-20 (R15 — 分类学专家重整)**

---

## 一、项目定位

**一个把会议录音转成"谁说了什么"的工具，声纹库越用越准，AI 问答跨会议总结。**

核心三件事：
1. **录音 + 实时字幕** — Qwen3-ASR-Flash-Realtime + ASR 代理自动重连
2. **声纹归属** — 3D-Speaker ECAPA 192d + 三档阈值 + margin/outlier 决策 + 加权 centroid + 音频质量门槛
3. **AI 问答** — Claude Agent SDK + 4 MCP 工具 + 跨会议 memory

---

## 二、文档分类（按职能维度切，MECE）

每一级目录按**同一分类维度**切分，子项互斥穷尽。新增 spec 必须按本节归属决策。

### 2.1 项目概述（What & Why — 该项目是什么）
| 文档 | 说明 |
|------|------|
| [项目总览](项目概述/项目总览.md) | 背景、目标、核心功能 |
| [运行环境](项目概述/运行环境.md) | 技术栈、依赖、本地启动 |

### 2.2 架构设计（How — 跨模块整体视角）
| 文档 | 说明 |
|------|------|
| [系统架构](架构设计/系统架构.md) | 三进程拓扑、SQLite schema、整体数据流 |

### 2.3 功能模块（How — 单模块实现细节）
| 文档 | 说明 |
|------|------|
| [录音管线](功能模块/录音管线.md) | WebAudio 采集 → 三模式音源 → ScriptProcessor → PCM 推到 ASR + 切句 ingest |
| [ASR 容错](功能模块/ASR容错.md) | ASR Proxy 中转 DashScope + 自动重连 + session.update replay + UI 警告 |
| [SSE 总线](功能模块/SSE总线.md) | HMR-safe globalThis EventEmitter + meeting:[id] 命名空间 + 15s ping |
| [AI 问答](功能模块/AI问答.md) | Claude Agent SDK query() + 4 个 SQLite MCP 工具 + 跨会议 memory + meeting_chats |
| [设置管理](功能模块/设置管理.md) | SQLite settings 表 + 按功能配置（4 块）+ 各自测试端点 + key 脱敏 |
| [声纹算法 v2](功能模块/声纹算法.md) | 余弦匹配 + margin 决策 + outlier σ + 加权 centroid + 音频质量门槛 + 重复检测 |
| [日志系统](功能模块/日志系统.md) | pino（前端 API）+ asr-proxy 文件日志（部分过时，R7 之前） |

### 2.4 开发计划（When — 时间维度）
| 日期 | 链接 |
|------|------|
| 2026.05.19 | [R7 — voiceprint MVP](开发计划/2026.05.19/voiceprint-meeting-recorder.md) |
| 2026.05.20 | [R8 audio channels](开发计划/2026.05.20/r8-audio-channels-and-streaming.md) · [R9 Agent SDK summary](开发计划/2026.05.20/r9-agent-sdk-summary-and-memory.md) · [R10 settings page](开发计划/2026.05.20/r10-settings-page.md) · [R11 chat export settings](开发计划/2026.05.20/r11-chat-export-settings.md) · [R11b 飞书 docs](开发计划/2026.05.20/r11b-feishu-docs.md) · [R12 llmmelon + 设备检测](开发计划/2026.05.20/r12-llmmelon-default-and-check-page.md) · [R13 下载修复 + 声纹删除](开发计划/2026.05.20/r13-download-empty-fix-and-voiceprint-delete.md) · [R14 声纹算法 v2](开发计划/2026.05.20/r14-voiceprint-algorithm-v2.md) |

### 2.5 自动化测试（How to verify — 两版）
| 文档 | 受众 |
|------|------|
| [_人类版_验收手册](自动化测试/_人类版_验收手册.md) | **人类** 5 分钟跑完，发版前必跑 |
| [自动化测试套件 INDEX](自动化测试/INDEX.md) | **AI** 详细套件入口 |
| - 录音 / ASR 容错 / 会议详情 / AI 问答 / 下载导出 / 声纹库 / 设置页 / 设备检测 / API 端点 / 声纹算法 | AI 详细版（含 curl 命令 + 期望 JSON shape + 失败排查） |

### 2.6 历史归档（Archived — 已废弃但保留）
| 归档 | 内容 |
|------|------|
| [v2.5-meetflow](历史归档/v2.5-meetflow/) | 旧 MeetFlow v1.0~v2.5 资料（2026.04 已废弃，仅供回溯） |

### 2.7 规范（Norms — 项目本地规则）
| 文档 | 说明 |
|------|------|
| [知识库维护规则](规范/知识库维护规则.md) | docs/ 何时改、改哪、怎么改、质量门槛、与 kb skill 关系 |

### 2.8 元数据
- [README](README.md) — 知识库使用规范
- [_GAP](_GAP.md) — 已知漂移 + 待完善 roadmap-shaped gap

---

## 三、按场景找文档

| 我想… | 看这里 |
|-------|--------|
| 第一次了解项目 | [项目总览](项目概述/项目总览.md) + 本 INDEX §一、§二 |
| 起本地开发 | [运行环境](项目概述/运行环境.md) + 项目根 [README](../README.md) |
| 改录音管线 | [录音管线](功能模块/录音管线.md) + `web/src/app/page.tsx` |
| 改 ASR 通路 | [ASR 容错](功能模块/ASR容错.md) + `web/src/asr-proxy.ts` |
| 改 AI 问答 | [AI 问答](功能模块/AI问答.md) + `web/src/lib/agent.ts` |
| 改设置 | [设置管理](功能模块/设置管理.md) + `web/src/app/settings/page.tsx` |
| 改声纹算法 | [声纹算法](功能模块/声纹算法.md) + `web/src/lib/match.ts` |
| 改 SSE 实时字幕 | [SSE 总线](功能模块/SSE总线.md) + `web/src/lib/sse-bus.ts` |
| 跑回归测试（人类） | [_人类版_验收手册](自动化测试/_人类版_验收手册.md) |
| 跑回归测试（AI） | [自动化测试 INDEX](自动化测试/INDEX.md) |
| 看下一步该干什么 | [_GAP](_GAP.md) §B 待完善 |
| 知识库怎么维护 | [规范/知识库维护规则](规范/知识库维护规则.md) |

---

## 四、关键端口 & 配置

| 端口 | 服务 |
|------|------|
| 4927 | Next.js dev (前端 + API Routes) |
| 4928 | ASR WebSocket Proxy → DashScope (自动重连) |
| 4929 | Voiceprint Service (Docker, 3D-Speaker ECAPA) |

配置入口：浏览器 `/settings` 按功能分四块独立配置（ASR / Agent / Voiceprint / Embedding）+ 每块测试按钮。env 见 `web/.env.local`，SQLite 见 `data/vp.db`，详细见 [设置管理](功能模块/设置管理.md)。

---

## 五、Agent 工作规约（精简版）

1. **改代码前必读**：本 INDEX → 相关 spec（按 §三对照）→ 对应代码文件
2. **改完代码必更新**：spec（覆盖式）+ 开发计划 r\<N>-\*.md（追加式）+ INDEX（如有新文档）
3. **三层信任**：docs > 代码 > 外部产物。冲突时改代码朝向 docs，禁止反过来
4. **完整规范**：[规范/知识库维护规则](规范/知识库维护规则.md)
5. **kb 通用规则**：`~/.claude/skills/kb/SKILL.md` 五条分类律（MECE / 单维 / 本质 / 命名 / 粒度）
