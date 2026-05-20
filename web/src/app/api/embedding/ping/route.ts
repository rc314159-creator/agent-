/**
 * POST /api/embedding/ping
 *
 * 用配置的 embedding base URL + key 调一次 /v1/embeddings 测连通性
 * + 返回向量维度。
 */

import { getSetting } from "@/lib/db";

export const runtime = "nodejs";

export async function POST() {
  const apiKey =
    getSetting("embedding_api_key") ??
    process.env.YUNWU_API_KEY ??
    process.env.LLMMELON_API_KEY;
  const rawBase =
    getSetting("embedding_base_url") ??
    process.env.YUNWU_BASE_URL ??
    "https://api.yunwu.ai/v1";
  const model = getSetting("embedding_model") ?? "text-embedding-3-small";

  if (!apiKey) {
    return Response.json({ ok: false, error: "未配置 Embedding API Key" }, { status: 400 });
  }

  // Normalize: ensure base ends with /v1 for OpenAI-compat /embeddings
  const base = rawBase.replace(/\/+$/, "");
  const url = base.endsWith("/v1") ? `${base}/embeddings` : `${base}/v1/embeddings`;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, input: "ping" }),
    });
    const d = await r.json() as { data?: Array<{ embedding: number[] }>; error?: { message?: string } };
    if (!r.ok) {
      return Response.json({ ok: false, error: d.error?.message ?? `HTTP ${r.status}` }, { status: 500 });
    }
    const dim = d.data?.[0]?.embedding?.length;
    return Response.json({ ok: true, dim });
  } catch (e: unknown) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
