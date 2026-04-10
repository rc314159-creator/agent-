---
title: 知识库使用规范
description: 知识库的目录结构、使用规则和更新规范
status: 已批准
created: 2026-04-09
updated: 2026-04-10
update_reason: 按 /kb skill 规范补充 frontmatter 和更新规则
---

# 知识库使用规范

本目录是 Auto-Picture / MeetFlow 的核心知识系统，服务于开发者和 AI Agent。

## 目录结构

```
docs/
├── INDEX.md        ← 唯一入口，从这里开始
├── README.md       ← 本文件
├── _GAP.md         ← 已知漂移/待修跟踪
├── 项目概述/       → 项目背景、技术栈、运行环境
├── 架构设计/       → 系统架构、设计决策
├── 功能模块/       → 各功能详细文档
├── 开发计划/       → 按日期归档的开发计划
└── 修复历史/       → 按日期归档的修复记录
```

## 使用规则

### 阅读顺序

1. 先读 `INDEX.md` 获取全局视图
2. 按任务需要读具体文档
3. 查看 `开发计划/` 了解最近工作方向

### 文档格式

- 所有 spec 文件必须有 YAML frontmatter（title, status, updated）
- 使用中文撰写，技术术语保留英文
- 文件间引用使用相对路径的 markdown 链接

### 更新规则

- **改完代码 → 更新对应文档**（使用 `/kb update`）
- **新功能 → 新建功能模块文档**
- **架构变动 → 更新架构设计文档**
- **修复 bug → 创建修复记录**（`修复历史/YYYY.MM.DD修复N/fix_plan.md`）
- **任何文档变动 → 更新 INDEX.md**
