import { createOpenAI } from "@ai-sdk/openai";
import { streamText, generateText, zodSchema, stepCountIs } from "ai";
import { z } from "zod";
import { NextRequest } from "next/server";
import { apiLogger, logRequest, writeAuditLog } from "@/lib/logger";

const log = apiLogger("ai");

const BASE_SYSTEM_PROMPT = `你是 MeetFlow 智能协作助手，正在辅助一场产品群面讨论。

你的能力：
- 根据用户画布内容和语音转录提供分析和建议
- 使用搜索工具获取最新网络信息
- 获取网页详细内容
- 回答产品、市场、竞品相关问题
- 帮助总结讨论要点

规则：
- 当用户要求搜索、查找信息时，必须使用 searchWeb 工具
- 当搜索结果不够详细时，使用 fetchWebPage 获取具体页面
- 用中文回复，语言简洁专业，适度使用 markdown 格式
- 引用搜索结果时附上来源 URL`;

// ---- Tool definitions ----

const TOOLS = {
  searchWeb: {
    description:
      "搜索互联网获取最新信息。当用户问到需要实时数据、新闻、行业动态、竞品信息、或你不确定的事实时使用。",
    inputSchema: zodSchema(
      z.object({
        query: z.string().describe("搜索关键词"),
        count: z.number().optional().describe("返回结果数量，默认5"),
      })
    ),
    execute: async ({ query, count }: { query: string; count?: number }) => {
      const n = count ?? 5;
      log.info({ tool: "searchWeb", query, count: n }, "Tool call: searchWeb");
      writeAuditLog({ event: "tool_call", detail: { tool: "searchWeb", query, count: n } });
      try {
        const res = await fetch(
          `http://localhost:8888/search?q=${encodeURIComponent(query)}&format=json&language=zh-CN`,
          { signal: AbortSignal.timeout(10000) }
        );
        const data = await res.json();
        const results = (
          (data.results as Array<{ title: string; url: string; content: string }>) || []
        ).slice(0, n);
        const output = results
          .map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.content}`)
          .join("\n\n");
        log.info({ tool: "searchWeb", resultCount: results.length }, "Tool result: searchWeb");
        writeAuditLog({ event: "tool_result", detail: { tool: "searchWeb", resultCount: results.length } });
        return output || "未找到相关结果";
      } catch (err) {
        log.error({ tool: "searchWeb", err }, "Tool error: searchWeb");
        return "搜索服务暂不可用，请稍后重试";
      }
    },
  },

  fetchWebPage: {
    description:
      "获取指定 URL 网页的文本内容。在搜索后需要查看具体页面详情时使用。",
    inputSchema: zodSchema(
      z.object({
        url: z.string().describe("要访问的完整 URL"),
      })
    ),
    execute: async ({ url }: { url: string }) => {
      log.info({ tool: "fetchWebPage", url }, "Tool call: fetchWebPage");
      writeAuditLog({ event: "tool_call", detail: { tool: "fetchWebPage", url } });
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "MeetFlow/2.0" },
          signal: AbortSignal.timeout(10000),
        });
        const html = await res.text();
        // Simple HTML to text extraction
        const text = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        const truncated = text.length > 3000 ? text.slice(0, 3000) + "..." : text;
        log.info({ tool: "fetchWebPage", length: truncated.length }, "Tool result: fetchWebPage");
        return truncated;
      } catch {
        return "无法访问该页面";
      }
    },
  },

  getCurrentTime: {
    description: "获取当前日期和时间。当用户问到日期、时间、今天是几号时使用。",
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      const now = new Date();
      return `当前时间: ${now.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`;
    },
  },
};

// ---- Tool display names for frontend ----
const TOOL_LABELS: Record<string, string> = {
  searchWeb: "搜索网络",
  fetchWebPage: "访问网页",
  getCurrentTime: "获取时间",
};

export async function POST(req: NextRequest) {
  const { messages, context, stream: useStream = true } = await req.json();
  const endLog = logRequest(log, "POST", "/api/ai", {
    messagesCount: messages?.length,
    hasContext: !!context,
    stream: useStream,
  });

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

  // ---- Non-streaming mode ----
  if (!useStream) {
    try {
      const { text } = await generateText({
        model,
        system: systemPrompt,
        messages,
        tools: TOOLS,
        stopWhen: stepCountIs(5),
      });
      endLog(200, { responseLength: text.length });
      writeAuditLog({ event: "ai_complete", route: "/api/ai", status: 200, detail: { stream: false, responseLength: text.length } });
      return Response.json({
        choices: [{ message: { role: "assistant", content: text } }],
      });
    } catch (err) {
      endLog(500);
      log.error({ err }, "AI generateText failed");
      return Response.json(
        { choices: [{ message: { role: "assistant", content: "AI 请求失败，请重试。" } }] },
        { status: 200 }
      );
    }
  }

  // ---- Streaming mode ----
  endLog(200, { stream: true });
  writeAuditLog({ event: "ai_stream_start", route: "/api/ai", method: "POST", status: 200 });

  const result = streamText({
    model,
    system: systemPrompt,
    messages,
    tools: TOOLS,
    stopWhen: stepCountIs(5),
  });

  // Convert AI SDK fullStream → OpenAI-compatible SSE.
  // Tool calls are shown as inline status messages so the user can see what the AI is doing.
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (content: string) => {
        const data = JSON.stringify({ choices: [{ delta: { content } }] });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      let currentToolName = "";

      try {
        for await (const part of result.fullStream) {
          switch (part.type) {
            case "text-delta":
              send(part.text);
              break;

            case "tool-call":
              currentToolName = part.toolName;
              const label = TOOL_LABELS[part.toolName] || part.toolName;
              send(`\n> **[${label}]** `);
              // Log tool invocation with arguments
              if (part.toolName === "searchWeb") {
                const args = part.input as { query?: string };
                send(`搜索: ${args?.query || "..."}\n`);
              } else if (part.toolName === "fetchWebPage") {
                const args = part.input as { url?: string };
                send(`访问: ${args?.url || "..."}\n`);
              } else {
                send(`执行中...\n`);
              }
              writeAuditLog({ event: "tool_invoke", detail: { tool: part.toolName, args: part.input } });
              break;

            case "tool-result":
              const resultLabel = TOOL_LABELS[currentToolName] || currentToolName;
              const output = typeof part.output === "string" ? part.output : JSON.stringify(part.output);
              const resultPreview = output.length > 100 ? output.slice(0, 100) + "..." : output;
              send(`> **[${resultLabel} 完成]** ${resultPreview}\n\n`);
              writeAuditLog({ event: "tool_complete", detail: { tool: currentToolName } });
              break;

            // Ignore other event types (step-start, step-finish, etc.)
            default:
              break;
          }
        }
      } catch (err) {
        log.error({ err }, "Stream processing error");
        send("\n\n[AI 处理过程中出现错误]");
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
