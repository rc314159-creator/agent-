import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getSegmentsDir } from "@/lib/db";

export const runtime = "nodejs";

// Serve raw WAV segments. Filename pattern is strictly <uuid>.wav so we
// never need to traverse subdirectories or escape data/segments/.
const VALID = /^[a-zA-Z0-9-]{8,64}\.wav$/;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  if (!VALID.test(name)) return new Response("invalid name", { status: 400 });
  const fp = path.join(getSegmentsDir(), name);
  if (!fs.existsSync(fp)) return new Response("not found", { status: 404 });
  const data = fs.readFileSync(fp);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "audio/wav",
      "Content-Length": String(data.length),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
