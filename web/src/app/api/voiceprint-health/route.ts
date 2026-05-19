import { voiceprintHealth } from "@/lib/voiceprint-client";

export const runtime = "nodejs";

export async function GET() {
  const h = await voiceprintHealth();
  return Response.json(h, { status: h.ok ? 200 : 503 });
}
