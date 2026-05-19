FROM python:3.11-slim

# Audio decode libraries (libsndfile1) + ffmpeg for fallback decoding.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libsndfile1 \
        ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Pin to CPU-only torch wheels (saves ~700 MB compared to default CUDA build,
# and we do not need GPU for inference at this scale).
RUN pip install --no-cache-dir \
    --index-url https://download.pytorch.org/whl/cpu \
    torch==2.4.1 torchaudio==2.4.1

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download model into the image so first request doesn't stall and the
# container works air-gapped.
RUN python -c "from speechbrain.inference.speaker import EncoderClassifier; \
EncoderClassifier.from_hparams(source='speechbrain/spkrec-ecapa-voxceleb', \
savedir='/app/models/ecapa', run_opts={'device':'cpu'})"

COPY main.py .

ENV PYTHONUNBUFFERED=1 \
    VOICEPRINT_MODEL_DIR=/app/models/ecapa

EXPOSE 4929
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "4929", "--log-level", "info"]
