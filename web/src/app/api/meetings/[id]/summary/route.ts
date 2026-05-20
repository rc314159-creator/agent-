import { NextRequest } from "next/server";
import {
  getAnthropicClient,
  getModel,
  getSystemPrompt,
  TOOLS,
  dispatchTool,
  saveSummaryMemory,
  loadPastSummaries,
} from "@/lib/agent";
import { getDataDir } from "@/lib/db";
import type Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      try {
        const client = getAnthropicClient();
        const model = getModel();
        const dataDir = getDataDir();
        const pastSummaries = loadPastSummaries(dataDir);
        const systemPrompt = getSystemPrompt() + (pastSummaries
          ? `\n\n## 历史会议总结记忆\n\n${pastSummaries}`
          : "");

        const messages: Anthropic.MessageParam[] = [
          {
            role: "user",
            content: `请分析会议 ID 为 "${id}" 的会议记录并生成总结。先获取会议内容，再结合历史说话人信息进行深度分析。`,
          },
        ];

        let finalText = "";
        let continueLoop = true;

        while (continueLoop) {
          const response = await client.messages.create({
            model,
            max_tokens: 4096,
            system: systemPrompt,
            tools: TOOLS,
            messages,
          });

          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of response.content) {
            if (block.type === "text") {
              finalText += block.text;
              send("text_delta", { text: block.text });
            } else if (block.type === "tool_use") {
              send("tool_use", { name: block.name, input: block.input });
              const result = dispatchTool(block.name, block.input as Record<string, unknown>);
              send("tool_result", { name: block.name, result: JSON.parse(result) });
              toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
            }
          }
          if (toolResults.length > 0) {
            messages.push({ role: "assistant", content: response.content });
            messages.push({ role: "user", content: toolResults });
          }

          if (response.stop_reason === "end_turn" || response.stop_reason === "stop_sequence") {
            continueLoop = false;
          } else if (response.stop_reason === "tool_use") {
            // loop continues — messages already updated above
          } else {
            continueLoop = false;
          }
        }

        if (finalText) {
          saveSummaryMemory(id, finalText, dataDir);
        }

        send("done", { summary: finalText });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: msg })}\n\n`));
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
