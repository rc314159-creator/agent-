# ASR 容错测试

## 功能描述

DashScope Qwen3-ASR-Flash-Realtime 长 session 偶发返回 `Internal service error` 关闭连接（code 1011）。代理层自动重连，前端 UI 透明感知；多次重连失败时显眼警告而非静默。

## 代码路径

| 组件 | 路径 |
|------|------|
| ASR 代理（自动重连核心） | `web/src/asr-proxy.ts` |
| 录音页（事件监听 + banner） | `web/src/app/page.tsx` |

关键函数：
- `connectUpstream()` — 创建/重建 DashScope 连接
- `tryReconnect()` — 指数退避重连，60s 窗口 5 次上限
- `lastSessionUpdate` — 重连后 replay session.update

## 测试用例

### TC-ASR-01：自动重连透明（最关键）

**手动注入故障：**
```bash
# 找到 asr-proxy 当前持有的 upstream socket，模拟服务端断开
# 暂无内建注入工具，可用真实长 session 触发（开 30+ 分钟会议）
# 或修改 asr-proxy.ts 加 chaos：setTimeout(() => upstream.close(1011), 60000)
```

**期望：**
- 客户端 WS 不断开
- asr-proxy 日志：`scheduling dashscope reconnect, attempt: 1, delayMs: 200`
- 客户端收到 `{"type":"proxy.reconnecting","attempt":1,"delayMs":200}`
- ≤4 秒后客户端收到 `{"type":"proxy.reconnected"}`
- 录音继续工作，新的 utterance 接着进 DB

### TC-ASR-02：重连预算耗尽

**步骤：**
1. 60 秒内强制 6 次重连失败

**期望：**
- 第 6 次时客户端收到 `{"type":"proxy.reconnect_failed","message":"上游 ASR 服务多次重连失败"}`
- 客户端 WS 主动关闭
- 录音页 UI 显示红色脉冲 banner：「⚠️ ASR 已断开」
- recording state 保留为 true（让用户手动停止以归档会议）

### TC-ASR-03：UI 状态切换

**步骤：**（直接看 page.tsx 逻辑）

**期望：**
- `asrConn === "ok"` → 录音正常，无 banner
- `asrConn === "reconnecting"` → 黄色 banner「🔄 重连中 — 正在重连 ASR（第 N 次，Xms 后）…」
- `asrConn === "lost"` → 红色 animate-pulse banner「⚠️ ASR 已断开 — ...」

### TC-ASR-04：session.update 重放

**前提：** 客户端发送过 `{"type":"session.update","session":{...}}` 配置 turn_detection/silence_duration_ms

**步骤：**
1. 触发一次重连

**期望：**
- 新 upstream 连上后，asr-proxy 自动 replay 之前缓存的 session.update
- 日志：`replayed session.update after reconnect`
- 重连后 turn_detection 等参数与重连前一致
