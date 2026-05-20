# Auto-Picture 项目规则

## 第一条：先读再做

任何任务前先读 `docs/INDEX.md`，按需展开相关 spec。

## 第二条：改代码必同步 docs

每次 commit 前自检 `docs/规范/知识库维护规则.md` §七提交流程清单。完整规则全在那个文档，不在本文件重复。

## 第三条：分类学心态

整理 docs 时按 `~/.claude/skills/kb/SKILL.md` 五条分类律（MECE / 单维 / 本质 / 命名 / 粒度）。项目本地补充见 `docs/规范/知识库维护规则.md`。

## 关键索引

| 我要做… | 看哪 |
|---------|------|
| 第一次进项目 | `docs/INDEX.md` |
| 改某个功能 | `docs/功能模块/<功能>.md` |
| 改架构 | `docs/架构设计/系统架构.md` |
| 起迭代 / 写 fix_plan | `docs/开发计划/YYYY.MM.DD/<topic>.md` |
| 跑回归测试（人类） | `docs/自动化测试/_人类版_验收手册.md` |
| 跑回归测试（AI） | `docs/自动化测试/INDEX.md` |
| 看本项目下一步 | `docs/_GAP.md` |
| 知识库怎么维护 | `docs/规范/知识库维护规则.md` |

## 跨会话记忆

涉及用户偏好 / 协作反馈 / 项目动态 → `~/.claude/projects/-Users-rencan-product/memory/`。技术真相一律去 `docs/`。
