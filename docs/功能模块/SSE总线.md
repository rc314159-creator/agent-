---
title: SSE 总线（实时字幕广播）
description: HMR-safe globalThis EventEmitter 单例 + meeting:[id] 命名空间 + ReadableStream + 15s ping 保活
status: 已批准
created: 2026-05-20
updated: 2026-05-20
update_reason: R15 从系统架构.md 拆出来
related:
  - docs/功能模块/录音管线.md
  - docs/自动化测试/会议详情.md
---

# SSE 总线

会议详情页 `/meetings/[id]` 实时滚字幕的机制。

## 一、单例 EventEmitter（HMR-safe）

代码：`web/src/lib/sse-bus.ts`

```ts
const g = globalThis as unknown as { __sseBus?: EventEmitter };
if (!g.__sseBus) {
  g.__sseBus = new EventEmitter();
  g.__sseBus.setMaxListeners(200);
}
```

**为什么 globalThis**：Next.js dev HMR 每次热重载会重新 import 模块，普通 module-level 变量会丢，导致正在订阅的 client 失联。globalThis 跨 HMR reload 保持同一实例。

## 二、写端：emitUtterance

代码：`web/src/lib/sse-bus.ts` `emitUtterance(meetingId, data)`

调用点：`web/src/app/api/utterances/ingest/route.ts` 第 6 步，INSERT 完 + recomputeCentroid 完 → `emitUtterance(meetingId, {utteranceId, speakerName, text, ...})`。

事件 key 是 `meeting:<id>`，data 是 `UtteranceEvent`。

## 三、读端：/api/meetings/[id]/stream

代码：`web/src/app/api/meetings/[id]/stream/route.ts`

```ts
export async function GET(req, { params }) {
  // 1. 检查 meeting 存在
  // 2. 检查 meeting.ended_at 状态（结束的会议仍可订阅，但不会有新事件）
  // 3. new ReadableStream:
  //    - 初始 event:ping (链路打通)
  //    - subscribeMeeting(id, cb) 拿到 unsubscribe fn
  //    - 15s 一次 ping 保活
  //    - req.signal abort 清理订阅 + close stream
  // 4. 返回 Content-Type: text/event-stream
}
```

SSE 帧格式：`event: utterance\ndata: {json}\n\n`

## 四、浏览器订阅

代码：`web/src/app/meetings/[id]/page.tsx`

```ts
const es = new EventSource(`/api/meetings/${id}/stream`);
es.addEventListener("utterance", (e) => {
  const data = JSON.parse(e.data);
  // 去重追加到 utterances state
  setUtterances((prev) => prev.find((u) => u.id === data.utteranceId) ? prev : [...prev, data]);
  bottomRef.current?.scrollIntoView();
});
es.addEventListener("ping", () => { /* 保活，无操作 */ });
```

## 五、停止订阅

5 秒一次轮询 `/api/meetings/[id]` 看 `endedAt` 是否非空：
- 是 → `es.close()` + UI「● 录音中」红点消失 + 「实时字幕接收中…」spinner 消失

## 六、关联

- ingest 触发点 → [录音管线](录音管线.md) §四 ingest 处理
- 测试用例 → [自动化测试/会议详情](../自动化测试/会议详情.md)
