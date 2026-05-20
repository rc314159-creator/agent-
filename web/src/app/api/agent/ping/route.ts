import { getSetting } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

export async function POST() {
  const apiKey =
    getSetting("anthropic_api_key") ??
    process.env.ANTHROPIC_API_KEY ??
    process.env.YUNWU_API_KEY;
  const rawBase =
    getSetting("anthropic_base_url") ??
    process.env.ANTHROPIC_BASE_URL ??
    (process.env.YUNWU_API_KEY ? process.env.YUNWU_BASE_URL : undefined);
  const model = getSetting("anthropic_model") ?? "claude-sonnet-4-5-20250929";
  const baseURL = rawBase ? rawBase.replace(/\/v1\/?$/, "") : undefined;

  if (!apiKey) {
    return Response.json({ ok: false, error: "未配置 API Key" }, { status: 400 });
  }

  try {
    const client = new Anthropic({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
    });
    const msg = await client.messages.create({
      model,
      max_tokens: 16,
      messages: [{ role: "user", content: "reply with just the word OK" }],
    });
    const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
    return Response.json({ ok: true, reply: text });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
