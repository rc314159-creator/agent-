import { createOpenAI } from "@ai-sdk/openai";
import { streamText, generateText } from "ai";
import { NextRequest } from "next/server";
import { apiLogger, logRequest, writeAuditLog } from "@/lib/logger";

const log = apiLogger("ai");

const BASE_SYSTEM_PROMPT = `你是 Midflow 智能协作助手，正在辅助一场产品群面讨论。你的职责：
- 根据用户的画布内容和语音转录，提供分析和建议
- 回答产品、市场、竞品相关问题
- 帮助总结讨论要点
- 语言简洁专业，适度使用 markdown 格式
- 用中文回复`;

export async function POST(req: NextRequest) {
  const { messages, context, stream: useStream = true } = await req.json();
  const endLog = logRequest(log, "POST", "/api/ai", { messagesCount: messages?.length, hasContext: !!context, stream: useStream });

  const apiKey = process.env.YUNWU_API_KEY;
  if (!apiKey) {
    endLog(500);
    writeAuditLog({ event: "ai_error", route: "/api/ai", status: 500, detail: { error: "API key not configured" } });
    return new Response(JSON.stringify({ error: "YUNWU_API_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const yunwu = createOpenAI({
    apiKey,
    baseURL: process.env.YUNWU_BASE_URL || "https://api.yunwu.ai/v1",
  });

  const model = yunwu(process.env.YUNWU_MODEL || "gpt-5.4");

  const systemPrompt = context
    ? `${BASE_SYSTEM_PROMPT}\n\n当前工作区内容如下：\n${context}`
    : BASE_SYSTEM_PROMPT;

  if (!useStream) {
    const { text } = await generateText({
      model,
      system: systemPrompt,
      messages,
    });
    endLog(200, { responseLength: text.length });
    writeAuditLog({ event: "ai_complete", route: "/api/ai", method: "POST", status: 200, detail: { stream: false, responseLength: text.length } });
    return Response.json({
      choices: [{ message: { role: "assistant", content: text } }],
    });
  }

  endLog(200, { stream: true });
  writeAuditLog({ event: "ai_stream_start", route: "/api/ai", method: "POST", status: 200, detail: { stream: true } });

  const result = streamText({
    model,
    system: systemPrompt,
    messages,
  });

  // Convert AI SDK stream to OpenAI-compatible SSE format for frontend compatibility
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      for await (const chunk of result.textStream) {
        const data = JSON.stringify({
          choices: [{ delta: { content: chunk } }],
        });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
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
