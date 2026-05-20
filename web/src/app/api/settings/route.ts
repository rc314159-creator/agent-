import { NextRequest } from "next/server";
import { getAllSettings, setSetting } from "@/lib/db";

export const runtime = "nodejs";

const KEY_FIELDS = ["anthropic_api_key", "dashscope_api_key", "agent_api_key", "asr_api_key"];

function maskValue(key: string, value: string): string {
  if (!KEY_FIELDS.includes(key) || value.length <= 4) return value;
  return `${value.slice(0, 4)}${"•".repeat(Math.max(0, value.length - 8))}${value.slice(-4)}`;
}

export async function GET() {
  const raw = getAllSettings();
  const masked: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    masked[k] = maskValue(k, v);
  }
  return Response.json({ settings: masked });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as Record<string, string>;
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string") setSetting(key, value);
  }
  return Response.json({ ok: true });
}
