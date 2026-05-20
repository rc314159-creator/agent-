---
title: R10 — /settings 页 + SQLite settings 表 + agent 配置 UI
状态: 已完成
创建日期: 2026-05-20
---

# R10 — /settings 页 + SQLite settings 表 + agent 配置 UI

## 背景与目标

用户原话（需求出处）：
> "前端可以配置 agent 以及其余涉及到 api 的 api key 之类的"

目标：
1. 增加 `/settings` 页面，集中管理所有需要用户填写的配置
2. 配置持久化到 SQLite `settings` 表，不再硬编码在代码或 `.env`
3. 支持配置项：Anthropic API key、Agent model、Agent system prompt、DashScope API key
4. R9 的 Agent SDK 从 `settings` 表读取 API key 和 model（通过 `/api/settings` 接口）

**与 R9 的依赖关系**：R10 建表 + API，R9 读取。R10 理想先于 R9 完成，但 R9 有 fallback（读 `process.env`），所以两者可并行开发。

---

## 数据库变更

### 新增表 `settings`

```sql
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

### 预置 Key 清单

| Key | 说明 | 默认值 |
|-----|------|--------|
| `anthropic_api_key` | Claude API key，R9 Agent 使用 | 空（必填） |
| `agent_model` | Agent 调用的模型 ID | `claude-opus-4-7` |
| `agent_system_prompt` | Agent 的系统提示词 | 内置默认（见 R9 plan） |
| `dashscope_api_key` | DashScope ASR API key | 空（必填） |

**注意**：`dashscope_api_key` 当前硬编码在 `web/src/asr-proxy.ts`，R10 实现后从 `settings` 表读取，去掉硬编码。

---

## API 设计

### GET /api/settings

返回所有配置项（API key 做脱敏处理）。

```
GET /api/settings
Response: {
  "settings": {
    "anthropic_api_key": "sk-ant-...XXXX",   // 仅展示后4位
    "agent_model": "claude-opus-4-7",
    "agent_system_prompt": "你是一个...",
    "dashscope_api_key": "sk-e2c4...XXXX"
  }
}
```

### PATCH /api/settings

批量更新配置项。

```
PATCH /api/settings
Body: {
  "anthropic_api_key": "sk-ant-api03-...",
  "agent_model": "claude-sonnet-4-6"
}
Response: { "updated": ["anthropic_api_key", "agent_model"] }
```

### GET /api/settings/[key]（内部使用）

供后端服务（R9 Agent、ASR proxy）读取单个配置的完整值（不脱敏）。
此 API **不对前端开放**，通过内部 `getSetting(key)` 函数直接读 DB。

---

## 数据流：DashScope key 迁移

当前状态：`sk-e2c4923387e147629d69b634dcb9a1a1` 硬编码在 `asr-proxy.ts`。

R10 完成后：
1. `asr-proxy.ts` 改为调 `getSetting('dashscope_api_key')` 读取
2. 如果 DB 中没有配置，fallback 到 `process.env.DASHSCOPE_API_KEY`
3. 前端 Settings 页提示用户填写

---

## 文件清单

### 新增

| 文件 | 内容 |
|------|------|
| `web/src/app/settings/page.tsx` | /settings 页面主体 |
| `web/src/app/api/settings/route.ts` | GET（脱敏列表）+ PATCH（批量更新） |
| `web/src/components/SettingsForm.tsx` | 表单组件（各配置项的 input + 保存状态） |

### 修改

| 文件 | 改动 |
|------|------|
| `web/src/lib/db.ts` | 新增 `settings` 表建表 + `getSetting(key)` / `setSetting(key, value)` helper |
| `web/src/asr-proxy.ts` | `DASHSCOPE_API_KEY` 从 `getSetting('dashscope_api_key')` 读取，fallback 到 env |
| `web/src/app/layout.tsx` 或导航组件 | 顶部导航加 `[⚙ 设置]` 链接 |

---

## UI 草图

### /settings 页

```
┌─────────────────────────────────────────────────────────────┐
│  ← 设置                                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ## Claude Agent 配置                                       │
│                                                             │
│  Anthropic API Key                                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  sk-ant-••••••••••••••••••••••••••••••••••••XXXX    │   │
│  └─────────────────────────────────────────────────────┘   │
│  [查看/修改]                                                 │
│                                                             │
│  Agent 模型                                                 │
│  ┌─────────────────────────────┐                           │
│  │  claude-opus-4-7         ▾  │                           │
│  └─────────────────────────────┘                           │
│  可选：claude-opus-4-7 / claude-sonnet-4-6                  │
│                                                             │
│  Agent System Prompt                                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  你是一个专业的会议记录分析助手...                   │   │
│  │                                                     │   │
│  │  (多行文本框, 可编辑)                                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ## ASR 配置                                               │
│                                                             │
│  DashScope API Key                                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  sk-e2c4••••••••••••••••••••••••••••••••••••XXXX    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│                                    [保存所有设置]            │
│                                                             │
│  ✓ 上次保存：2026-05-20 15:30                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 安全注意事项

1. **API key 展示脱敏**：GET `/api/settings` 返回值中，API key 类字段只显示后 4 位（`sk-ant-...XXXX`），完整值不经浏览器传输
2. **写入不回显**：前端 PATCH 后，清空输入框（或仍显示脱敏值），不在 JS 内存中保留明文
3. **SQLite 无加密**：`data/vp.db` 存储明文 key，`data/` 已在 `.gitignore` 中，不上传 git。生产级可加 SQLCipher，当前不做
4. **仅本地服务**：工具设计为本地单用户，不需要 RBAC

---

## 导航集成

在录音页 `/` 顶部导航加⚙图标：

```
会议记录    [声纹库] [历史会议] [⚙]
                                ↑ 链接到 /settings
```

R9 中 API key 未配置时，总结面板显示：

```
⚠ 未配置 Anthropic API Key
[前往设置 →]
```

---

## 验收清单

- [ ] R10-1: 访问 `/settings` 页面，显示 4 个配置项表单
- [ ] R10-2: 填写 Anthropic API Key 点保存，刷新后仍保留（脱敏展示）
- [ ] R10-3: 修改 Agent model 从 opus 改为 sonnet，R9 总结时使用新 model
- [ ] R10-4: 修改 Agent system prompt，下次生成总结时新 prompt 生效
- [ ] R10-5: 顶部导航包含⚙链接，可从任意页面跳转到 /settings
- [ ] R10-6: 更新 DashScope API Key，ASR 录音功能仍正常（不需要重启服务）
- [ ] R10-7: DashScope key 从代码硬编码迁移到 settings 表后，旧的 asr-proxy.ts 不再含明文 key

---

## 风险与回退

| 风险 | 概率 | 回退 |
|------|------|------|
| ASR proxy 是独立 Node 进程（4928），读 DB 时 db.ts 未 bundle | 中 | asr-proxy.ts 改用 `process.env` 读取，用户在 .env 配置，Settings 页仅用于 Agent 配置 |
| SQLite WAL 并发：Next.js API 和 asr-proxy 同时读写 | 低 | `PRAGMA journal_mode = WAL` 已开启，读并发安全；Settings 写入极低频率，无实际冲突 |
| 用户误删 API key | 低 | 表单做非空校验；保存前确认弹窗 |
