# 会议记录工具 — 知识库索引

> 本文件是知识库的**唯一入口**。Agent 和开发者都从这里开始导航，按需逐层加载。
>
> 最后更新：**2026-05-20 (R14)**

---

## 一、项目定位

**一个把会议录音转成"谁说了什么"的工具，声纹库越用越准，AI 问答跨会议总结。**

核心三件事：
1. **录音 + 实时字幕** — Qwen3-ASR-Flash-Realtime (DashScope) + ASR 代理自动重连
2. **声纹归属** — 3D-Speaker ECAPA 192d 嵌入 + 三档阈值 + margin / outlier 决策 + 加权 centroid（详见 [声纹算法](功能模块/声纹算法.md)）
3. **AI 问答** — Claude Agent SDK + 4 MCP 工具 + 跨会议 memory

---

## 二、文档分类（按职能维度切，MECE）

每一级目录按**同一分类维度**切分，子项互斥穷尽。

### 2.1 项目概述（What & Why）
| 文档 | 说明 |
|------|------|
| [项目总览](项目概述/项目总览.md) | 背景、目标、核心功能 |
| [运行环境](项目概述/运行环境.md) | 技术栈、依赖、本地启动 |

### 2.2 架构设计（How — 跨模块）
| 文档 | 说明 |
|------|------|
| [系统架构](架构设计/系统架构.md) | 三进程拓扑、SQLite schema、SSE 总线、设置 / 数据流 |

### 2.3 功能模块（How — 单模块）
| 文档 | 说明 |
|------|------|
| [声纹算法 v2](功能模块/声纹算法.md) | 余弦匹配 + margin 决策 + outlier σ + 加权 centroid + 音频质量门槛 + 重复检测 |
| [日志系统](功能模块/日志系统.md) | pino（前端 API）+ asr-proxy 文件日志 |

### 2.4 开发计划（When — 时间维度）
| 日期 | 链接 |
|------|------|
| 2026.05.19 | [R7 — voiceprint MVP](开发计划/2026.05.19/voiceprint-meeting-recorder.md) |
| 2026.05.20 | [R8](开发计划/2026.05.20/r8-audio-channels-and-streaming.md) · [R9](开发计划/2026.05.20/r9-agent-sdk-summary-and-memory.md) · [R10](开发计划/2026.05.20/r10-settings-page.md) · [R11](开发计划/2026.05.20/r11-chat-export-settings.md) · [R11b](开发计划/2026.05.20/r11b-feishu-docs.md) |

### 2.5 自动化测试（How to verify）
| 文档 | 说明 |
|------|------|
| [测试套件索引](自动化测试/INDEX.md) | 9 个测试套件 + 冒烟 curl 全过 + 验收标准 |
| - 录音 / ASR 容错 / 会议详情 / AI 问答 / 下载导出 / 声纹库 / 设置页 / 设备检测 / API 端点 | 每个套件含步骤 + 期望 + 失败排查 |

### 2.6 历史归档（Archived — 已废弃但保留）
| 归档 | 内容 |
|------|------|
| [v2.5-meetflow](历史归档/v2.5-meetflow/) | 旧 MeetFlow v1.0~v2.5 资料（画布/AI/MindMap/CopilotKit，2026.04 已废弃，仅供回溯） |

### 2.7 元数据
- [README](README.md) — 知识库使用规范
- [_GAP](_GAP.md) — 已知漂移 + 待完善 roadmap-shaped gap

---

## 三、按场景找文档

| 我想… | 看这里 |
|-------|--------|
| 第一次了解项目 | [项目总览](项目概述/项目总览.md) + 本 INDEX 一、二节 |
| 起本地开发 | [运行环境](项目概述/运行环境.md) + 项目根 [README](../README.md) |
| 改声纹算法 | [声纹算法 v2](功能模块/声纹算法.md) + `web/src/lib/match.ts` |
| 改 ASR 通路 | [系统架构](架构设计/系统架构.md) §录音管线 + `web/src/asr-proxy.ts` |
| 改 AI 问答 | [系统架构](架构设计/系统架构.md) §Agent SDK 总结流程 + `web/src/lib/agent.ts` |
| 跑回归测试 | [自动化测试索引](自动化测试/INDEX.md) |
| 看本项目下一步该干什么 | [_GAP](_GAP.md) §B.待完善 |

---

## 四、关键端口 & 配置

| 端口 | 服务 |
|------|------|
| 4927 | Next.js dev (前端 + API Routes) |
| 4928 | ASR WebSocket Proxy → DashScope (自动重连) |
| 4929 | Voiceprint Service (Docker, 3D-Speaker ECAPA) |

配置入口：浏览器 `/settings` 按功能分四块独立配置（ASR / Agent / Voiceprint / Embedding）+ 每块测试按钮。env 见 `web/.env.local`，SQLite 见 `data/vp.db`，详见 [架构设计](架构设计/系统架构.md) §配置管理。

---

## 五、Agent 工作规约

1. **改代码前必读**：本 INDEX → 相关 spec（按 §三表对照）→ 对应代码文件
2. **改完代码必更新**：spec（覆盖式）+ 开发计划/YYYY.MM.DD/（追加式）+ INDEX（如有新文档）
3. **三层信任**：docs > 代码 > 外部产物。冲突时改代码朝向 docs，禁止反过来
4. **kb 整理规范**：见全局 `~/.claude/skills/kb/SKILL.md` 五条分类律（MECE / 单维 / 本质 / 命名 / 粒度）
