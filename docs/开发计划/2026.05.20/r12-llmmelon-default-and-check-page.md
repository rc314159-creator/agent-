---
title: R12 - llmmelon 默认 + 设备检测页 + Embedding 配置块
description: 把 Agent 默认中转改 llmmelon + haiku-4-5；新建 /check 设备检测页；settings 加 Embedding 第四块；asr-proxy 加自动重连
status: 已完成
created: 2026-05-20
updated: 2026-05-20
update_reason: R12 落地
execution_status: 已完成
related:
  - docs/功能模块/声纹算法.md
  - docs/架构设计/系统架构.md
---

# R12 — llmmelon 默认 + 设备检测页 + Embedding 配置块 + ASR 重连

## 背景（用户原话）

1. "AI 问答 (Agent)不是使用llmmelon吗？embedding可以使用云雾，然后这个测试没通啊"
2. "前端用户要能够测试录音、音频导入，也就是麦克风录音之类的功能是否成功"
3. "模拟像在线笔试那样的环境（用户可能需要开启摄像头和麦克风进行测试）"
4. "我这里一直在开会，你正好可以启动测试一下"
5. "有bug你就修复啊"（指 ASR 长 session 断连用户察觉不到）

## 目标

| 子任务 | 验收 |
|--------|------|
| Agent 默认换 llmmelon | settings PROVIDERS 加 llmmelon 推荐置顶，默认 model claude-haiku-4-5-20251001 |
| DB 自动迁移 | 旧 yunwu base_url + sonnet-4-5 自动迁到 llmmelon（用户改过自定义值的不动） |
| /check 设备检测页 | 5 块独立检测（麦克风/摄像头/系统音频/扬声器/后端服务），nav 加「设备检测」tab |
| Embedding 配置块（预留） | settings 第四块 URL/Key/Model + 测试按钮，默认云雾 + text-embedding-3-small |
| ASR 自动重连 | DashScope 异常断开 → 指数退避 5 次重连 → replay session.update |
| ASR 重连失败警告 | 前端红色 banner，不再骗用户「录音中」 |

## 实现

### 关键文件
- `web/src/lib/db.ts` — initDb 末尾加 R12 一次性迁移逻辑
- `web/src/lib/agent.ts` — env 优先级 LLMMELON > YUNWU
- `web/src/app/api/agent/ping/route.ts` — 同上
- `web/src/app/api/embedding/ping/route.ts`（新建）— /v1/embeddings 测连通
- `web/src/app/check/page.tsx`（新建）— 设备检测页
- `web/src/components/nav.tsx` — 加「设备检测」tab
- `web/src/app/settings/page.tsx` — PROVIDERS 重排 + Embedding 第四块
- `web/src/asr-proxy.ts` — connectUpstream/tryReconnect 自动重连
- `web/src/app/page.tsx` — asrConn 状态 + 红色 banner

### 关键技术决策

**llmmelon 选 haiku 不选 sonnet**：会议总结 chat 用 haiku-4-5 够，比 sonnet 便宜 5x。用户可在 settings 改。

**重连指数退避**：200/500/1000/2000/4000ms，60s 窗口 5 次预算。超过预算 → `proxy.reconnect_failed` + UI 红色脉冲警告。

**session.update replay**：缓存客户端最后一条 session.update，重连后第一个动作就 replay，保证 turn_detection 等参数一致。

## 验收记录

- ✅ Agent ping 200 OK
- ✅ Embedding ping 200 dim:1536
- ✅ /check 页面 5 块齐全 + 一键测后端通过
- ✅ ASR 重连：手动 chaos 注入 → 4 秒内透明恢复
- ✅ 重连失败：6 次失败 → 红色 banner pulse

## commit
- `794bb68 feat(R12): 设备检测页 + Agent 默认换 llmmelon + Embedding 配置块`
- `b155576 fix(ASR): DashScope 异常断开自动重连 + 前端断连显眼警告`

## 已知遗留 → _GAP.md
- ASR-03 主动周期重连（每 N 分钟）— P2
- ASR-04 多 ASR provider failover — P3
