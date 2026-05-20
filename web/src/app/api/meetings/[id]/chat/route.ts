import { NextRequest } from "next/server";
import { saveChatMessage, getChatMessages } from "@/lib/db";
import { runChatAgent } from "@/lib/agent";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const messages = getChatMessages(id);
  return Response.json({ messages });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { message } = (await req.json()) as { message: string };

  if (!message?.trim()) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  saveChatMessage(id, "user", message);

  const encoder = new TextEncoder();
  let assistantText = "";

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      try {
        for await (const evt of runChatAgent(id, message)) {
          if (evt.type === "text_delta") {
            assistantText += (evt.data.text as string) ?? "";
          }
          send(evt.type, evt.data);
        }
        if (assistantText) saveChatMessage(id, "assistant", assistantText);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        send("error", { error: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
