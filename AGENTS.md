# Auto-Picture Codex Rules

## Knowledge First

Before work, read `docs/INDEX.md`, recent `docs/开发计划/` records, relevant module docs, and historical fix records for similar issues.

Quick references:

- Project overview: `docs/项目概述/项目总览.md`
- Runtime environment: `docs/项目概述/运行环境.md`
- Architecture: `docs/架构设计/系统架构.md`
- Model config: `etc/README.md`
- Logging: `docs/功能模块/日志系统.md`

## Documentation Updates

After code changes:

- Bug fixes: create `docs/开发计划/<M.DD>修复<序号>/fix_plan.md` with issue, root cause, fix, impacted files, and test results.
- Feature changes: update relevant module docs.
- Architecture changes: update `docs/架构设计/` and `docs/INDEX.md`.
- Config changes: update `etc/README.md`.

## Memory And Docs

Use memory for user preferences, collaboration feedback, project dynamics, and external references that should not live in the repo. Use docs for architecture, feature behavior, development records, and config guides. If a decision affects both, update both and cross-link.
