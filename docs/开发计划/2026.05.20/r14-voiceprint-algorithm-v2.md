---
title: R14 - 声纹算法 v2 + 分类学专家视角整理 docs
description: 加权 centroid + margin 决策 + outlier σ + 音频质量门槛 + 重复检测；kb skill 加分类学心态
status: 已完成
created: 2026-05-20
updated: 2026-05-20
update_reason: R14 落地
execution_status: 已完成
related:
  - docs/功能模块/声纹算法.md
  - docs/_GAP.md
---

# R14 — 声纹算法 v2 + 分类学专家整理

## 背景（用户原话）

1. "既然算法不完美，你为什么不去做好呢？在你能做的范围内做到最好啊"
2. "同时把知识库更新维护好，以分类学专家的视角去做好"
3. "kb 这个 skill 是不是要更新一下，强调使用分类学专家的风格去做好知识库的整理归类"

## 算法 v2 改进点

| ID | 改进 | 修了 v1 哪个缺陷 |
|----|------|---|
| A1 | 置信度 + 时间衰减加权 centroid | #2 简单均值毒化 / #4 无时间衰减 |
| A2 | margin 决策 (top1-top2 < 0.05 → needs_review) | #1 静态阈值死板 |
| A3 | outlier σ-score (偏离 top1 历史 > 2σ → needs_review) | #3 无 outlier 检测 |
| A4 | audioQualityGate (RMS + ZCR + 时长) | #8 静音/合成音区分弱 |
| A5 | findDuplicateSpeakers + /voiceprints banner | #6 无全局重聚类（轻量代偿） |

未做的项（→ docs/_GAP.md VP-01~07）：全局重聚类、主动学习反例、PLDA 归一化、多模型集成、嵌入式 VAD、enrollment、长期度量

## kb skill 更新

`~/.claude/skills/kb/SKILL.md` 新增〇节「分类学专家心态」：
- 五条分类律（MECE / 单维 / 本质 / 命名一致 / 粒度对齐）
- 五个反模式（孤儿文档 / 黑洞目录 / 僵尸 spec / 同名漂移 / 跨层级粘连）
- organize 子命令 6 步必走（含 IS-A 链推理）
- audit 新增 5 项分类质量评分

## docs 整理

- 新建 docs/功能模块/声纹算法.md（算法 v2 完整 spec）
- 重写 docs/INDEX.md 按职能维度切（2.1-2.7 七节）
- 改造 docs/_GAP.md 支持 A 漂移 + B roadmap-shaped gap

## 实测验证

```bash
# 静音 WAV
curl -s POST /api/utterances/ingest --data-binary @silent.wav
→ {"skipped":true,"reason":"近乎静音 (RMS=0 < 100)"}

# Sin 波（440Hz @ 16kHz）
curl -s POST /api/utterances/ingest --data-binary @sin440.wav
→ {"needsReview":true, ...}  # margin/outlier 触发

# 重复检测
curl -s /api/speakers/duplicates?threshold=0.85
→ {"threshold":0.85, "pairs":[...]}
```

## commit
- `be31521 feat(R14): 声纹算法 v2 + 分类学专家视角整理 docs`

## 已知遗留 → _GAP.md
- 算法层面：VP-01 全局重聚类 / VP-02 主动学习反例 / VP-03 PLDA 归一化 等 P1-P3 共 7 项
