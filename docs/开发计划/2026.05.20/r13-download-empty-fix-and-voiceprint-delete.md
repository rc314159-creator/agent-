---
title: R13 - 下载对话空白修复 + 声纹删除 + 自动化测试目录
description: chat.md 空历史自动总结；声纹角色删除（cascade 含音频）；docs/自动化测试/ 9 套件初版
status: 已完成
created: 2026-05-20
updated: 2026-05-20
update_reason: R13 落地
execution_status: 已完成
related:
  - docs/功能模块/声纹算法.md
  - docs/自动化测试/INDEX.md
---

# R13 — 下载对话空白修复 + 声纹删除 + 自动化测试目录

## 背景（用户原话）

1. "下载的对话内容是空白" — 没问过 AI 的会议导出空 chat.md
2. "错误产生的声纹如何删除呢？" — 当前没有删除入口（如 fake-device 录到的「新用户 22」）
3. "请在知识库下面建立一个自动化测试的目录"

## 目标

| 子任务 | 验收 |
|--------|------|
| chat.md 空时自动总结 | meeting_chats 为空 → 自动跑一次 runChatAgent("帮我总结一下这次会议...") 写入再返回 |
| 删除声纹角色（cascade） | DELETE /api/speakers/[id]?cascade=1 删 utterances + audio_path wav 文件 |
| 详情页加红色删除按钮 | 二次确认对话框 + 删除后跳回 /voiceprints |
| 自动化测试目录 | docs/自动化测试/ 9 个套件 + INDEX |

## 实现

### 关键文件
- `web/src/app/api/meetings/[id]/chat.md/route.ts` — auto-summary 逻辑
- `web/src/app/api/speakers/[id]/route.ts` — 加 DELETE 端点
- `web/src/app/voiceprints/[id]/page.tsx` — 删除按钮 + 二次确认
- `docs/自动化测试/` × 10 个 md（INDEX + 9 套件）

### 自动化测试目录初版结构（R13 起手）

```
docs/自动化测试/
├── INDEX.md
├── 录音.md
├── ASR容错.md
├── 会议详情.md
├── AI问答.md
├── 下载导出.md
├── 声纹库.md
├── 设置页.md
├── 设备检测.md
└── API端点.md
```

R15 又会进一步拆分 AI 可执行 vs 人类手动版。

## commit
- `74a9004 feat(R13): 下载对话空时自动总结 + 声纹删除 + 自动化测试目录`

## 已知遗留 → _GAP.md
- 自动化测试目录"AI 执行步骤"还不够精确（R15 完善）
