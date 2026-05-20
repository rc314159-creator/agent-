# 自动化测试目录

> 项目所有功能的可重复测试清单。区分**两种使用场景**：
>
> | 受众 | 入口 | 详细度 | 用途 |
> |------|------|--------|------|
> | **人类** | [_人类版_验收手册.md](_人类版_验收手册.md) | 简短，只说"做什么" | 发版前 5 分钟跑完，确认可发布 |
> | **AI（自动化）** | 本目录其它 .md 文件 | 详细，含 curl/Playwright 命令 + 期望 JSON shape + 失败排查 | Agent 跑回归测试 / 排查具体 bug |
>
> 测试方式：
> - **API 测试**：curl 直击端点，验证 JSON / markdown / SSE 响应
> - **UI 测试**：Playwright MCP 一步一截图，截图用 Read 工具人眼/AI 分析

---

## 一、AI 详细测试套件目录

每个套件 .md 文件结构统一：
1. **功能描述** — 一句话定位
2. **代码路径** — 涉及的所有源文件路径
3. **测试用例** — 编号 TC-<功能>-NN，含步骤 / 期望 / 失败排查

| 套件 | 路径 | 覆盖功能 | AI 可独立跑 |
|------|------|---------|------------|
| 录音流程 | [录音.md](./录音.md) | 一键直录 / 录音源选择 / 麦克风测试 / 停止录音 / ASR 流式字幕 / 自动归属 | 部分（真人语音部分要人类） |
| ASR 容错 | [ASR容错.md](./ASR容错.md) | DashScope 断连自动重连 / 重连失败警告 / 长 session 稳定性 | 仅 mock 注入部分 |
| 会议详情 | [会议详情.md](./会议详情.md) | utterance 列表 / SSE 实时流式 / 录音中状态 / 结束后变静态 | ✅ |
| AI 问答 | [AI问答.md](./AI问答.md) | chat 面板 / 推荐 prompt chips / SSE 流式 / 角色绑定 / 跨会议 memory / 多轮上下文 | ✅ |
| 下载导出 | [下载导出.md](./下载导出.md) | 会议记录.md 格式 / AI 对话.md / 空对话自动总结 / 中文文件名编码 | ✅ |
| 声纹库 | [声纹库.md](./声纹库.md) | 列表 / 详情 / 改名 / 移动 utterance / 删除角色（cascade）/ 播放样本 / 重复检测 + 合并 | ✅ |
| 设置页 | [设置页.md](./设置页.md) | 四块独立配置（ASR/Agent/Voiceprint/Embedding）/ 保存留存 / 测试连通 / DB migration | ✅ |
| 设备检测 | [设备检测.md](./设备检测.md) | 麦克风/摄像头/系统音频/扬声器/后端服务 5 项检测 | 部分（设备权限部分要人类） |
| API 端点 | [API端点.md](./API端点.md) | 所有 REST 端点 curl 测试，覆盖 4xx/5xx 错误处理 | ✅ |

---

## 二、AI 自动跑全套（冒烟）

最常用的一组 curl，AI 直接复制粘贴跑：

```bash
PROD=http://localhost:4927

echo "=== 后端 4 个 ping ==="
curl -s $PROD/api/voiceprint-health | jq -c
curl -s -X POST $PROD/api/agent/ping | jq -c
curl -s -X POST $PROD/api/asr/ping | jq -c
curl -s -X POST $PROD/api/embedding/ping | jq -c

echo "=== 下载导出 ==="
curl -s $PROD/api/meetings/test-r9/transcript.md | head -10
curl -s $PROD/api/meetings/test-r9/chat.md | head -10

echo "=== 声纹库 ==="
curl -s $PROD/api/speakers | jq -c '.speakers | length'
curl -s "$PROD/api/speakers/duplicates?threshold=0.85" | jq -c

echo "=== 设置（脱敏） ==="
curl -s $PROD/api/settings | jq -c '.settings | keys'

echo "=== 创建测试会议 + 验证 SSE ==="
M=$(curl -s -X POST $PROD/api/meetings -H "Content-Type: application/json" -d '{}' | jq -r .id)
curl -s -N $PROD/api/meetings/$M/stream | head -5
```

期望返回值清单见各套件 .md。

---

## 三、整体 PASS / FAIL 标准

**整体 PASS**：
- 七大功能模块（录音 / ASR / 会议详情 / AI 问答 / 下载 / 设置 / 声纹库）所有 AI 套件用例 PASS
- 9 个 API 端点 curl 全返回 2xx + 期望 JSON
- 人类版手册逐条对应都 ✅

**整体 FAIL（任一发现立刻修，不能发版）**：
- UI 状态与实际不符（如显示"录音中"但 WS 已死）
- 任何下载文件为空或缺字段
- 声纹库无法删除错误角色
- 任何 API 5xx 没被 UI 友好提示

---

## 四、补充 AI 测试套件待写（R16+ 补全）

| 套件 | 状态 |
|------|------|
| 声纹算法.md | 待补（覆盖 audioQualityGate / margin / outlier / 加权 centroid 的具体 curl 验证） |
| Embedding 配置.md | 待补 |
| KB 维护规则.md | 待补 |

这些已在 `docs/_GAP.md` B 节 + 本表跟踪。
