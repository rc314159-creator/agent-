---
title: R8 — 录音通道选择 + 麦克风测试 UI + 会议详情页流式字幕
状态: 待实现
创建日期: 2026-05-20
---

# R8 — 录音通道选择 + 麦克风测试 UI + 会议详情页流式字幕

## 背景与目标

MVP R7 完成了基本录音→ASR→声纹归属管线。R8 解决两个用户体验痛点：

1. **录音通道单一**：当前只采麦克风音频，无法录制系统声音（如在线会议、视频播放），无法同时录麦克风+系统混合。
2. **会议详情页无实时字幕**：历史会议 `/meetings/[id]` 是静态展示，录音中看不到字幕增量刷新。

## 需求出处

用户原话（未直接指定，但从产品合理性推断）：
- 录音通道选择是现代会议工具标配，支持系统音频可接入视频会议场景
- 流式字幕是 R7 遗留的体验 gap：录音页有实时字幕，但进入 meetings/[id] 页面是静态的

## 功能点清单

### F1 — 录音通道选择

**选项：**
- 麦克风（默认，当前已有）
- 系统音频（`getDisplayMedia` with audio only，需浏览器权限）
- 混合（麦克风 + 系统，WebAudio `ChannelMergerNode` 合并）

**触发时机：** 点击「开始录音」按钮前，弹出通道选择器（或顶部下拉）。

### F2 — 麦克风测试 UI

在录音页，开始录音前展示：
- 音量计（实时 RMS 柱状图）
- 设备列表（`enumerateDevices`，可切换）
- 麦克风质量预检：静音 2 秒后提示"未检测到声音，请检查麦克风"

### F3 — 会议详情页流式字幕（SSE 推送）

录音进行时，如果用户导航到 `/meetings/[id]`（当前录音对应的会议），实时字幕通过 SSE 追加渲染。

历史会议（已结束）仍为静态展示，无需 SSE。

---

## API 设计

### 新增：GET /api/meetings/[id]/stream

```
GET /api/meetings/:id/stream
Response: text/event-stream

事件格式：
event: utterance
data: {"utteranceId":"xxx","speakerId":"yyy","speakerName":"张三","text":"你好","confidence":0.87,"needsReview":false,"startMs":1200,"endMs":2300}

event: ping
data: {}
```

**实现方式：**
- 每次 `POST /api/utterances/ingest` 写入成功后，通过内存中的 `EventEmitter`（单进程 Next.js dev server）广播给对应 meetingId 的 SSE 订阅者
- 生产级用 Redis pub/sub 替换，但当前规模不需要

### 新增：GET /api/asr/devices（可选，前端直接用浏览器 API）

前端通过 `navigator.mediaDevices.enumerateDevices()` 获取设备列表，无需后端接口。

---

## 数据库变更

**无需变更** existing schema。

可选：在 `meetings` 表增加 `audio_source TEXT DEFAULT 'microphone'` 记录本次录音通道：

```sql
ALTER TABLE meetings ADD COLUMN audio_source TEXT NOT NULL DEFAULT 'microphone';
```

字段值：`'microphone'` / `'system'` / `'mixed'`

---

## 文件清单

### 新增

| 文件 | 内容 |
|------|------|
| `web/src/lib/sse-bus.ts` | 轻量 EventEmitter 单例，管理 meetingId → SSE 订阅者集合 |
| `web/src/app/api/meetings/[id]/stream/route.ts` | SSE endpoint，订阅 sse-bus，每 15s 发 ping |
| `web/src/components/AudioSourcePicker.tsx` | 通道选择弹窗（麦克风/系统/混合） |
| `web/src/components/MicrophoneTester.tsx` | 音量计 + 设备列表 + 预检 |

### 修改

| 文件 | 改动 |
|------|------|
| `web/src/app/page.tsx` | 集成 AudioSourcePicker（开始前选通道）+ MicrophoneTester + `getDisplayMedia` 逻辑 |
| `web/src/app/meetings/[id]/page.tsx` | 录音进行中订阅 SSE，动态追加新 utterance；会议结束后静态展示 |
| `web/src/app/api/utterances/ingest/route.ts` | 写入成功后 emit 到 sse-bus |

---

## UI 草图

### 录音页通道选择（开始录音前）

```
┌─────────────────────────────────────────────────────────┐
│  选择录音通道                                            │
├─────────────────────────────────────────────────────────┤
│  ● 麦克风       [MacBook Pro 麦克风 ▾]                   │
│  ○ 系统音频     （将请求屏幕共享权限）                    │
│  ○ 混合         麦克风 + 系统音频                         │
├─────────────────────────────────────────────────────────┤
│  🎙 音量检测:  ████░░░░░░  -12 dB                       │
│  [开始录音]                                              │
└─────────────────────────────────────────────────────────┘
```

### 会议详情页（录音进行中）

```
┌─────────────────────────────────────────────────────────┐
│  ← 会议 2026-05-20 15:30    ● 录音中...                  │
├─────────────────────────────────────────────────────────┤
│  张三   15:30:12                                         │
│    "今天我们讨论方案..."                                  │
│                                                          │
│  李四   15:30:45                                         │
│    "我觉得 A 方案更好"                                    │
│                                              ↑ 实时追加  │
│  ⟳ 正在识别...   15:31:02                               │
└─────────────────────────────────────────────────────────┘
```

---

## 技术细节

### 系统音频采集

```typescript
// 系统音频：getDisplayMedia 并只取 audio
const displayStream = await navigator.mediaDevices.getDisplayMedia({
  video: false,
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    sampleRate: 16000,
  },
});

// 混合：ChannelMergerNode
const ctx = new AudioContext({ sampleRate: 16000 });
const micSource = ctx.createMediaStreamSource(micStream);
const sysSource = ctx.createMediaStreamSource(displayStream);
const merger = ctx.createChannelMerger(2);
micSource.connect(merger, 0, 0);
sysSource.connect(merger, 0, 1);
// merger 输出接 ScriptProcessorNode
```

### SSE Bus（内存单例）

```typescript
// lib/sse-bus.ts
import { EventEmitter } from "events";
const bus = new EventEmitter();
bus.setMaxListeners(100);
export function emit(meetingId: string, data: unknown) {
  bus.emit(`meeting:${meetingId}`, data);
}
export function subscribe(meetingId: string, cb: (data: unknown) => void) {
  bus.on(`meeting:${meetingId}`, cb);
  return () => bus.off(`meeting:${meetingId}`, cb);
}
```

---

## 验收清单

- [ ] R8-1: 录音页显示通道选择器，默认"麦克风"
- [ ] R8-2: 选"系统音频"后点开始，浏览器弹出屏幕共享权限请求
- [ ] R8-3: 麦克风测试：检测到声音时音量计有动画
- [ ] R8-4: 麦克风静音 2s 显示提示"未检测到声音"
- [ ] R8-5: 录音中打开 `/meetings/[id]` 页面，新字幕实时追加（SSE）
- [ ] R8-6: 会议结束后 SSE 连接自动关闭，页面变静态
- [ ] R8-7: 切换麦克风设备后重新开始录音，ASR 正常工作

---

## 风险与回退

| 风险 | 概率 | 回退 |
|------|------|------|
| `getDisplayMedia` 在 macOS Safari 不支持 audio only | 中 | 降级：系统音频选项在 Safari 置灰，提示用 Chrome |
| SSE 在 Next.js dev server HMR 重载时连接断开 | 高 | 前端自动重连（EventSource 默认行为），加 retry 字段 |
| ChannelMergerNode 混合时回声 | 低 | 仅混合模式下可选关闭回声消除 |
