import { NextRequest } from "next/server";
import { subscribeMeeting } from "@/lib/sse-bus";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Only stream if the meeting is still ongoing (no ended_at)
  const meeting = getDb().prepare("SELECT ended_at FROM meetings WHERE id = ?").get(id) as
    | { ended_at: number | null }
    | undefined;

  if (!meeting) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial ping
      controller.enqueue(encoder.encode("event: ping\ndata: {}\n\n"));

      const unsub = subscribeMeeting(id, (data) => {
        const payload = `event: utterance\ndata: ${JSON.stringify(data)}\n\n`;
        try {
          controller.enqueue(encoder.encode(payload));
        } catch {
          // stream closed
        }
      });

      // Ping every 15 seconds to keep connection alive
      const pingTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode("event: ping\ndata: {}\n\n"));
        } catch {
          clearInterval(pingTimer);
          unsub();
        }
      }, 15_000);

      // Clean up when client disconnects
      req.signal.addEventListener("abort", () => {
        clearInterval(pingTimer);
        unsub();
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      // Allow retry on HMR reload
      retry: "2000",
    },
  });
}
