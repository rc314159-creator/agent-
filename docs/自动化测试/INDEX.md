# 自动化测试目录

> 项目所有功能的可重复测试清单，每个测试包括：**功能描述 / 代码路径 / 测试步骤 / 期望表现 / 失败排查**。
>
> 测试方式分两类：
> - **API 测试**：curl 直击端点，看 JSON / markdown / SSE 返回符合预期
> - **UI 测试**：Playwright 脚本一步一截图，截图用 Read 工具人眼/AI 分析
>
> Playwright 用 `npx @playwright/cli` 或 MCP `mcp__playwright__*` 工具。

---

## 测试套件目录

| 测试套件 | 路径 | 覆盖功能 |
|---------|------|---------|
| 录音流程 | [录音.md](./录音.md) | 一键直录 / 录音源选择 / 麦克风测试 / 停止录音 / ASR 流式字幕 / 自动归属 |
| ASR 容错 | [ASR容错.md](./ASR容错.md) | DashScope 断连自动重连 / 重连失败警告 / 长 session 稳定性 |
| 会议详情 | [会议详情.md](./会议详情.md) | utterance 列表渲染 / SSE 实时流式 / 录音中状态 / 结束后变静态 |
| AI 问答 | [AI问答.md](./AI问答.md) | chat 面板 / 推荐 prompt chips / SSE 流式 / 角色绑定 / 跨会议 memory / 多轮上下文 |
| 下载导出 | [下载导出.md](./下载导出.md) | 会议记录.md 格式 / AI 对话.md / 空对话自动总结 / 中文文件名编码 |
| 声纹库 | [声纹库.md](./声纹库.md) | 列表 / 详情 / 改名 / 移动 utterance / 删除角色（cascade）/ 播放样本 |
| 设置页 | [设置页.md](./设置页.md) | 四块独立配置（ASR/Agent/Voiceprint/Embedding）/ 保存留存 / 测试连通 |
| 设备检测 | [设备检测.md](./设备检测.md) | 麦克风/摄像头/系统音频/扬声器/后端服务 5 项检测 |
| API 端点 | [API端点.md](./API端点.md) | 所有 REST 端点 curl 测试，覆盖 4xx/5xx 错误处理 |

---

## 全部跑一遍（冒烟）

```bash
# 1. 后端 4 个 ping 全过
curl -s -X POST http://localhost:4927/api/agent/ping
curl -s -X POST http://localhost:4927/api/asr/ping
curl -s http://localhost:4927/api/voiceprint-health
curl -s -X POST http://localhost:4927/api/embedding/ping

# 2. 下载导出
curl -s "http://localhost:4927/api/meetings/test-r9/transcript.md" | head -10
curl -s "http://localhost:4927/api/meetings/test-r9/chat.md" | head -10

# 3. UI 主流程
npx @playwright/cli codegen http://localhost:4927/
```

每个测试套件 .md 文件里有更具体的预期返回。

---

## 验收标准

**整体 PASS 标准：**
- 录音、会议详情、AI 问答、下载、设置、设备检测、声纹库 7 大模块各自所有测试用例 PASS
- API 端点全部返回预期 HTTP 状态码 + JSON shape
- ASR 容错：模拟 DashScope 中断后 1-5 秒内自动恢复

**整体 FAIL 标准（任一发现立刻停手修）：**
- UI 上录音状态与实际不符（如显示"录音中"但 WS 已死）
- 下载文件为空或缺字段
- 声纹库无法删除错误角色
- 任何 API 5xx 没被 UI 友好提示
