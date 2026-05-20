# 已知漂移与待完善 (Gap Tracker)

> 跟踪两类条目：
> - **A. 漂移**：知识库与代码不一致（解决后标关闭，不删行）
> - **B. 待完善**：算法 / 功能层面"知道但暂未实现"的事，按优先级与回收时机

最后审计：2026-05-20（R15）

---

## A. 漂移 (Drift)

| ID | 类别 | 描述 | spec | code | 不修原因 | 复审日期 |
|---|---|---|---|---|---|---|
| DRIFT-01 | docs | `功能模块/日志系统.md` (2026-04-09 创建) 跟 R12+ asr-proxy verbose log 不同步 | docs/功能模块/日志系统.md | web/src/asr-proxy.ts | 低影响，待真正用上日志聚合时再统一更新 | 2026-06-01 |

---

## B. 待完善 (Roadmap-shaped Gap)

### B.1 声纹算法（v2 → 完美版）

R14 落地的算法 v2 已覆盖大部分实战缺陷，下列是公认改进方向但**当前未实现**。按优先级排序。

| ID | 优先级 | 描述 | 当前状态 | 触发条件 |
|---|---|---|---|---|
| VP-01 | P1 | 全局周期重聚类（HAC / DBSCAN）—— 跨会议批量审视已有 cluster 是否过粗/过细 | 未实现，只有用户手动 merge | 当 speaker 数 > 50 或重复检测命中率 > 20% |
| VP-02 | P1 | 主动学习反例：用户 move utterance 后，原 speaker 加"不应包含此 embedding"的负梯度 | 未实现（只重算 centroid） | 用户 move 操作累积 > 100 次后评估收益 |
| VP-03 | P2 | PLDA 或 cosine 归一化（speaker-wise z-score） | 未实现 | 误归率 > 5% 时考虑 |
| VP-04 | P2 | 多模型集成：3D-Speaker + Whisper embedding 加权融合 | 未实现 | 中文场景准确率需求 > 95% |
| VP-05 | P3 | 嵌入式 VAD 检测：拒绝混入多人重叠的 segment | 未实现（ASR 端 server_vad 已切句，但单段内多人混合未识别） | 多人快速插话场景反馈 |
| VP-06 | P3 | Speaker enrollment：让用户主动录 30 秒注册一个新角色，跳过冷启动 | 未实现（只能从录音被动累积） | 用户反馈"开会前想绑定参与者声音" |
| VP-07 | P3 | 跨 sessions 持续度量（precision/recall over time） | 未实现 | 长期评估需求 |

### B.2 ASR 容错（已基本覆盖）

| ID | 优先级 | 描述 | 当前状态 |
|---|---|---|---|
| ASR-01 | done | DashScope 异常断开自动重连（指数退避 5 次） | R12 已实现 `web/src/asr-proxy.ts` |
| ASR-02 | done | 重连失败 UI 显眼警告 | R12 已实现 `web/src/app/page.tsx` |
| ASR-03 | P2 | 主动周期重连（每 N 分钟）—— 避免长 session 触发 DashScope 服务端 idle 关闭 | 未实现 |
| ASR-04 | P3 | 多 ASR provider failover（DashScope ↔ 其他厂商） | 未实现 |

### B.3 AI 问答（已基本覆盖）

| ID | 优先级 | 描述 | 当前状态 |
|---|---|---|---|
| CHAT-01 | done | Claude Agent SDK + 4 MCP 工具 + 跨会议 memory | R9-R11 已实现 |
| CHAT-02 | done | 推荐 prompt + 一键发送 | R11 已实现 |
| CHAT-03 | done | 下载对话 markdown（空时自动总结） | R13 已实现 |
| CHAT-04 | P2 | 上下文窗口超长时自动 summarize 旧轮 | 未实现（目前简单取最近 6 条） |
| CHAT-05 | P3 | 语义检索过往会议（需要 docs/功能模块/Embedding 配置块真正接入） | 未实现，settings 第四块已预留 |

### B.4 用户体验

| ID | 优先级 | 描述 | 当前状态 |
|---|---|---|---|
| UX-01 | done | 一键直录（不再 2 步配置） | R12 已实现 |
| UX-02 | done | localStorage 记住上次录音源 | R12 已实现 |
| UX-03 | P2 | 录音中页面意外刷新时自动恢复 / 提示 "确实要离开吗" | 未实现 |
| UX-04 | P2 | 移动端响应式（当前 max-w-3xl 桌面优先） | 未实现 |

### B.5 知识库维护

| ID | 优先级 | 描述 | 当前状态 |
|---|---|---|---|
| KB-01 | done | 分类学专家心态（五律 + 五反模式 + IS-A 链推理） | R14 加进 `~/.claude/skills/kb/SKILL.md` |
| KB-02 | done | docs/规范/知识库维护规则.md（项目专属） | R15 已实现 |
| KB-03 | done | 拆功能模块：录音管线 / ASR容错 / SSE总线 / AI问答 / 设置管理 | R15 已实现 |
| KB-04 | done | 补 R12 R13 R14 plan 文件 | R15 已补 |
| KB-05 | done | 自动化测试目录区分 AI 详细版 / 人类精简版 | R15 已实现 |
| KB-06 | P2 | 自动化测试套件补 Embedding 配置 + KB 维护规则 | 未实现，列在测试 INDEX §四 |
| KB-07 | P3 | docs/功能模块/日志系统.md 更新到 R12+ 状态 | 当前是 R7 之前的版本 |

---

## C. 复审节奏

- 每个 R*（迭代）收尾时，扫一遍 B.* 条目，若已实现升 done 不删条目
- 每 4 周做一次 audit，若 P1 项一直未做且不阻塞，降到 P2
- 用户报新需求 / 缺陷时新增条目，标 ID + 优先级 + 触发条件
