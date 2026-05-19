"""
Voiceprint embedding service.

POST /embed   body: audio/wav bytes (any sample rate, mono or stereo)
              resp: {"embedding": [192 floats], "dim": 192, "model": "ecapa-tdnn"}
GET  /health  resp: {"status": "ok", "model": "ecapa-tdnn", "dim": 192}

Backend: SpeechBrain ECAPA-TDNN (192-d). Chosen for MVP because:
- 192d matches plan, strong cross-lingual transfer
- ~30 MB model, ~600 MB container
- Stable single-call API: encoder.encode_batch(tensor) -> (1, 192)

If Chinese-specific accuracy is insufficient later, swap to 3D-Speaker CAM++.
"""

import io
import logging
import os

import numpy as np
import soundfile as sf
import torch
import torchaudio
from fastapi import FastAPI, HTTPException, Request
from speechbrain.inference.speaker import EncoderClassifier

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("voiceprint")

TARGET_SR = 16000
MODEL_NAME = "ecapa-tdnn"
EMB_DIM = 192
MODEL_DIR = os.environ.get("VOICEPRINT_MODEL_DIR", "/app/models/ecapa")

app = FastAPI(title="voiceprint-service")

log.info("loading SpeechBrain ECAPA-TDNN from %s", MODEL_DIR)
encoder = EncoderClassifier.from_hparams(
    source="speechbrain/spkrec-ecapa-voxceleb",
    savedir=MODEL_DIR,
    run_opts={"device": "cpu"},
)
log.info("model loaded.")


def decode_wav(body: bytes) -> torch.Tensor:
    """Decode WAV bytes -> mono float32 tensor (1, N) at 16 kHz."""
    wav, sr = sf.read(io.BytesIO(body), dtype="float32")
    if wav.ndim > 1:
        wav = wav.mean(axis=1)
    tensor = torch.from_numpy(np.ascontiguousarray(wav)).unsqueeze(0)
    if sr != TARGET_SR:
        tensor = torchaudio.functional.resample(tensor, sr, TARGET_SR)
    return tensor


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_NAME, "dim": EMB_DIM}


@app.post("/embed")
async def embed(req: Request):
    body = await req.body()
    if len(body) < 1024:
        raise HTTPException(status_code=400, detail="audio too short (<1KB)")
    try:
        wav = decode_wav(body)
    except Exception as e:
        log.error("audio decode failed: %s", e)
        raise HTTPException(status_code=400, detail=f"audio decode failed: {e}")

    # SpeechBrain ECAPA needs at least ~0.5s of audio; pad if shorter.
    min_samples = TARGET_SR // 2
    if wav.shape[-1] < min_samples:
        pad = torch.zeros(1, min_samples - wav.shape[-1])
        wav = torch.cat([wav, pad], dim=-1)

    try:
        with torch.no_grad():
            emb = encoder.encode_batch(wav).squeeze().cpu().numpy()
        n = float(np.linalg.norm(emb))
        if n > 0:
            emb = emb / n
        return {
            "embedding": emb.astype(np.float32).tolist(),
            "dim": int(emb.shape[0]),
            "model": MODEL_NAME,
        }
    except Exception as e:
        log.exception("embedding failed")
        raise HTTPException(status_code=500, detail=str(e))
