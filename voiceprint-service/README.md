# voiceprint-service

声纹 embedding 服务. POST /embed 接 WAV bytes, 返回 192 维 float32 向量.

## 模型选型

| 选项 | 维度 | 大小 | 中文表现 | MVP 用 |
|------|------|------|---------|-------|
| **SpeechBrain ECAPA-TDNN** | 192 | ~30MB | 跨语言通用, 中文 OK | ✅ 默认 |
| 3D-Speaker CAM++ (中文 SOTA) | 512 | ~80MB | 最优 | 后续 |

## 接口

```
GET  /health
  → {"status": "ok", "model": "ecapa-tdnn", "dim": 192}

POST /embed                Content-Type: audio/wav (or any soundfile-readable)
  body: WAV bytes
  → {"embedding": [192 floats], "dim": 192, "model": "ecapa-tdnn"}
```

embedding 已 L2 归一化, 可直接做余弦相似度.

## 本地开发 (不 docker)

```bash
cd voiceprint-service
python -m venv .venv && source .venv/bin/activate
pip install --index-url https://download.pytorch.org/whl/cpu torch==2.4.1 torchaudio==2.4.1
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 4929
```

第一次启动会从 HuggingFace 下载 ECAPA 权重 (~30 MB) 到 `/app/models/ecapa`.

## Docker

```bash
docker build -t voiceprint-service .
docker run -p 4929:4929 voiceprint-service
```

## 验证

```bash
# 健康检查
curl http://localhost:4929/health

# 抽 embedding (随便一段 WAV)
curl -X POST -H "Content-Type: audio/wav" \
  --data-binary @sample.wav \
  http://localhost:4929/embed | jq '.dim, .model'
```
