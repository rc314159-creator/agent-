# API 端点测试

## 全部端点表

| 方法 | 路径 | 用途 | 文件 |
|------|------|------|------|
| GET | `/api/meetings` | 历史会议列表 | `web/src/app/api/meetings/route.ts` |
| POST | `/api/meetings` | 创建新会议 | 同上 |
| GET | `/api/meetings/[id]` | 会议详情 + utterances | `web/src/app/api/meetings/[id]/route.ts` |
| PATCH | `/api/meetings/[id]` | 改标题 / end 标记 | 同上 |
| GET | `/api/meetings/[id]/stream` | SSE 实时字幕 | `web/src/app/api/meetings/[id]/stream/route.ts` |
| GET | `/api/meetings/[id]/transcript.md` | 下载会议记录 markdown | `web/src/app/api/meetings/[id]/transcript.md/route.ts` |
| GET | `/api/meetings/[id]/chat.md` | 下载 AI 对话 markdown（空时自动总结） | `web/src/app/api/meetings/[id]/chat.md/route.ts` |
| GET | `/api/meetings/[id]/chat` | chat 历史列表 | `web/src/app/api/meetings/[id]/chat/route.ts` |
| POST | `/api/meetings/[id]/chat` | 发送一句 + SSE 流式回复 | 同上 |
| POST | `/api/meetings/[id]/summary` | SSE 流式总结 | `web/src/app/api/meetings/[id]/summary/route.ts` |
| GET | `/api/speakers` | 全部 speaker 列表 | `web/src/app/api/speakers/route.ts` |
| POST | `/api/speakers` | 创建 speaker | 同上 |
| GET | `/api/speakers/[id]` | 详情 + utterance | `web/src/app/api/speakers/[id]/route.ts` |
| PATCH | `/api/speakers/[id]` | 改名 / 合并 | 同上 |
| **DELETE** | **`/api/speakers/[id]`** | **删除（默认拒绝有 utterance）** | 同上 |
| **DELETE** | **`/api/speakers/[id]?cascade=1`** | **删除 + 连同所有 utterance 和音频** | 同上 |
| POST | `/api/utterances/ingest` | 上传 WAV → 切句 + 声纹 + 归属 | `web/src/app/api/utterances/ingest/route.ts` |
| PATCH | `/api/utterances/[id]` | 移动到他人 / 确认 | `web/src/app/api/utterances/[id]/route.ts` |
| GET | `/api/segments/[name]` | 音频文件下载 | `web/src/app/api/segments/[name]/route.ts` |
| GET | `/api/voiceprint-health` | 声纹服务健康 | `web/src/app/api/voiceprint-health/route.ts` |
| GET | `/api/settings` | 全部设置（key 脱敏） | `web/src/app/api/settings/route.ts` |
| PATCH | `/api/settings` | 批量更新设置 | 同上 |
| POST | `/api/asr/ping` | ASR WS 握手测试 | `web/src/app/api/asr/ping/route.ts` |
| POST | `/api/agent/ping` | Agent 端到端测试 | `web/src/app/api/agent/ping/route.ts` |
| POST | `/api/embedding/ping` | Embedding 端到端测试 | `web/src/app/api/embedding/ping/route.ts` |
| GET | `/api/asr` | ASR proxy ws URL（前端用） | `web/src/app/api/asr/route.ts` |
| WS | `ws://localhost:4928` | ASR proxy（DashScope 中转 + 自动重连） | `web/src/asr-proxy.ts` |

## 冒烟 curl 全过

```bash
PROD=http://localhost:4927
echo "=== Health ==="
curl -s $PROD/api/voiceprint-health
curl -s -X POST $PROD/api/agent/ping
curl -s -X POST $PROD/api/asr/ping
curl -s -X POST $PROD/api/embedding/ping

echo "=== Meetings ==="
curl -s $PROD/api/meetings | jq '.meetings[0:2]'
M=$(curl -s -X POST $PROD/api/meetings -H "Content-Type: application/json" -d '{}' | jq -r .id)
curl -s $PROD/api/meetings/$M

echo "=== Speakers ==="
curl -s $PROD/api/speakers | jq '.speakers | length'

echo "=== Downloads ==="
curl -s $PROD/api/meetings/test-r9/transcript.md | head -10
curl -s $PROD/api/meetings/test-r9/chat.md | head -10

echo "=== Settings ==="
curl -s $PROD/api/settings | jq '.settings | keys'

# Cleanup test meeting
curl -s -X DELETE $PROD/api/speakers/dummy 2>&1 || true
```

## HTTP 状态码约定

| 状态 | 含义 |
|------|------|
| 200 | OK |
| 400 | 参数错误（缺字段 / 错的格式） |
| 404 | 资源不存在 |
| 409 | 冲突（如删除有 utterance 的 speaker 不带 cascade） |
| 500 | 服务端异常（DashScope 错 / Agent SDK 异常） |
| 502 | 外部服务异常（voiceprint embed 失败 / Anthropic 5xx） |
