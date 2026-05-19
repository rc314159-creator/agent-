# 会议记录工具 — 知识库索引

> 本文件是知识库的**唯一入口**. Agent 和开发者都从这里开始导航.
>
> 最后更新: 2026-05-19 (MVP — 会议记录工具, 砍掉旧 MeetFlow 画布/AI/MindMap 那一坨, 重塑为"录音 + ASR + 可进化声纹")

---

## 项目定位

一句话: **一个把会议录音转成"谁说了什么"的工具, 声纹库越用越准.**

核心三件事:
1. 录音 → 实时字幕 (Qwen3-ASR-Flash-Realtime)
2. VAD 切句 → 每句话立即抽 192d 声纹 embedding (本地 3D-Speaker docker 服务) → 跨会议匹配
3. 用户修正回流 → 声纹库进化 (centroid 增量更新)

---

## 快速导航

| 类别 | 核心文档 | 说明 |
|------|----------|------|
| 当前开发 | [2026-05-19 Voiceprint MVP](开发计划/2026.05.19/voiceprint-meeting-recorder.md) | 完整架构 + SQLite schema + API + UI + 砍代码清单 |
| 历史归档 | [v2.5-meetflow](历史归档/v2.5-meetflow/) | 旧 MeetFlow v1.0~v2.5 全部资料 (画布/AI/MindMap, 已废弃) |
| 大模型配置 | [配置说明](../etc/README.md) | DashScope API key |

---

## 架构 (MVP)

```
浏览器 (4927)
  ├─ /          录音页 (开始/停止 + 实时字幕 + 自动模式开关)
  ├─ /voiceprints/[id]  声纹库 (角色列表 + 样本播放 + 改名 + 移动)
  └─ /meetings/[id]     历史会议 (对话流)
       │
       ├─ ASR Proxy (4928) → DashScope Qwen3-ASR-Flash-Realtime (WS)
       ├─ SQLite data/vp.db + data/segments/*.wav
       └─ Voiceprint Service (Docker, 4929) → 3D-Speaker CAM++ 192d embedding
```

---

## 数据模型

```sql
speakers   (id, name, sample_count, centroid BLOB, created_at, updated_at)
meetings   (id, title, started_at, ended_at)
utterances (id, meeting_id, speaker_id, text, start_ms, end_ms,
            audio_path, raw_embedding BLOB, confidence, needs_review, created_at)
```

---

## 关键算法

- **VAD 切句**: 浏览器 `@ricky0123/vad-web` (Silero VAD), 静音 800ms 封段
- **声纹抽取**: 3D-Speaker CAM++ (ModelScope `damo/speech_campplus_sv_zh-cn_16k-common`), 输出 192d float32
- **匹配**: 余弦相似度, 三档阈值 (>=0.75 自动归 / 0.6~0.75 待确认 / <0.6 新用户)
- **进化**: centroid 加权增量更新; 用户移动 utterance 时双方 centroid 重算 (用 raw_embedding)

---

## 开发计划

- [2026.05.19 Voiceprint MVP](开发计划/2026.05.19/voiceprint-meeting-recorder.md) — **状态: overnight 执行中**

---

## 历史归档

| 归档 | 内容 |
|------|------|
| [v2.5-meetflow](历史归档/v2.5-meetflow/) | 旧 MeetFlow 全部资料 (2026.04.09 ~ 04.11), 含群面记录助手、画布、AI 总结、思维导图、CopilotKit 等已废弃功能的设计与修复历史. 仅供回溯, 新功能不再依赖. |

---

## 端口分配

| 端口 | 服务 |
|------|------|
| 4927 | Next.js dev server |
| 4928 | ASR Proxy (WS to DashScope) |
| 4929 | Voiceprint Service (Docker) |

---

## 配置

- DashScope API key: 已硬编码在 `web/src/asr-proxy.ts` (临时, 后续移到 .env)
- 数据目录: `data/vp.db`, `data/segments/`

---

## Agent 工作规则

按 `CLAUDE.md` (项目级) + `~/.claude/CLAUDE.md` (全局) 的规范:
1. 改代码前先读本 INDEX + 开发计划
2. 修 bug 时记录 `docs/开发计划/YYYY.MM.DD/<topic>.md`
3. 架构变动同步更新本 INDEX
