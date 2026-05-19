/**
 * Client for the voiceprint embedding service (POST /embed, GET /health).
 * Defaults to http://localhost:4929; override via VOICEPRINT_SERVICE_URL.
 */

const VP_URL = process.env.VOICEPRINT_SERVICE_URL ?? "http://localhost:4929";

export async function embedAudio(wavBytes: Buffer): Promise<Float32Array> {
  const arrayBuf = wavBytes.buffer.slice(
    wavBytes.byteOffset,
    wavBytes.byteOffset + wavBytes.byteLength,
  ) as ArrayBuffer;
  const res = await fetch(`${VP_URL}/embed`, {
    method: "POST",
    headers: { "Content-Type": "audio/wav" },
    body: new Blob([arrayBuf], { type: "audio/wav" }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`voiceprint-service ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { embedding: number[]; dim: number; model: string };
  return new Float32Array(data.embedding);
}

export async function voiceprintHealth(): Promise<{ ok: boolean; model?: string; dim?: number }> {
  try {
    const res = await fetch(`${VP_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { ok: false };
    const j = (await res.json()) as { model?: string; dim?: number };
    return { ok: true, model: j.model, dim: j.dim };
  } catch {
    return { ok: false };
  }
}
