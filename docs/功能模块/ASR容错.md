---
title: ASR 通路与容错
description: ASR Proxy (4928) 中转 DashScope Qwen3-ASR-Flash-Realtime + 异常自动重连 + session.update replay + 前端 UI 警告
status: 已批准
created: 2026-05-20
updated: 2026-05-20
update_reason: R15 从系统架构.md 拆出来 + R12 重连机制详写
related:
  - docs/功能模块/录音管线.md
  - docs/自动化测试/ASR容错.md
---

# ASR 通路与容错

## 一、为什么要 Proxy

浏览器直连 DashScope 不行：
- DashScope 用 `Authorization: Bearer` header，浏览器 WebSocket API **不支持自定义 header**
- API key 不能放浏览器（明文泄露）

所以中转一层在本机：浏览器 ↔ `ws://localhost:4928` ↔ `wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-asr-flash-realtime`

## 二、配置读取顺序

代码：`web/src/asr-proxy.ts` `loadSettingsFromDb()`

| 字段 | 来源（按优先级） |
|------|--------|
| URL | settings.asr_ws_url > 默认 `wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-asr-flash-realtime` |
| API Key | settings.asr_api_key > settings.dashscope_api_key > env DASHSCOPE_API_KEY > 写死 fallback |

启动时一次性加载。改设置后**必须重启 proxy** 才生效。

## 三、自动重连机制（R12）

代码：`web/src/asr-proxy.ts` `connectUpstream()` + `tryReconnect()`

### 触发条件
- DashScope `upstream.on('close', code, reason)` 且 `code !== 1000`（非干净关闭）
- 典型场景：DashScope 服务端返回 `Internal service error` 关 code 1011

### 退避策略
```ts
RECONNECT_BACKOFF_MS = [200, 500, 1000, 2000, 4000];
MAX_RECONNECTS = 5;
RECONNECT_WINDOW_MS = 60_000;
```
60 秒窗口最多 5 次。超过预算 → 关 client + 发 `proxy.reconnect_failed`。

### Session 状态保持
- `lastSessionUpdate` 缓存客户端发的最后一条 `session.update`
- 重连后 upstream open → 第一个动作就是 replay 这条 session.update
- 客户端 PCM 数据在重连期间进 `pendingToUpstream` buffer（cap 500 帧），不丢

### 客户端事件通知
| 事件 | 时机 |
|------|------|
| `proxy.reconnecting` | 触发一次重连前 |
| `proxy.reconnected` | upstream open 成功，session.update replayed |
| `proxy.reconnect_failed` | 重连预算耗尽 |

## 四、前端 UI 状态

代码：`web/src/app/page.tsx`

| asrConn 状态 | UI | 触发 |
|-------------|----|------|
| `"ok"` | 无 banner（默认） | 正常录音 / `proxy.reconnected` 后 |
| `"reconnecting"` | 黄色 banner「🔄 重连中 — 正在重连 ASR（第 N 次，Xms 后）…」 | 收到 `proxy.reconnecting` |
| `"lost"` | 红色 animate-pulse banner「⚠️ ASR 已断开 — ...」 | 收到 `proxy.reconnect_failed` 或 ws.onclose 异常时 |

**关键**：录音中 ws.onclose 触发 → 强制 `asrConn=lost`，不再让 UI 骗用户「录音中」。

## 五、verbose 日志（R14 加）

代码：`web/src/asr-proxy.ts` `us.on('message')`

DashScope 任何 non-audio 事件（< 4KB JSON）都 log 出来：
```
[asr-proxy] dashscope evt conversation.item.input_audio_transcription.text { cid, preview: "今天..." }
```

便于排查"为什么字幕不出"这类问题。

## 六、关联

- 录音端如何调用 → [录音管线](录音管线.md)
- 测试用例 → [自动化测试/ASR容错](../自动化测试/ASR容错.md)
