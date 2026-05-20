import { NextRequest } from "next/server";
import { getAllSettings, setSetting } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ settings: getAllSettings() });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json()) as Record<string, string>;
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string") setSetting(key, value);
  }
  return Response.json({ ok: true });
}
