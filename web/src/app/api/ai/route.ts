import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const { messages, stream = true } = await req.json();

  const apiKey = process.env.YUNWU_API_KEY;
  const baseUrl = process.env.YUNWU_BASE_URL || "https://api.yunwu.ai/v1";
  const model = process.env.YUNWU_MODEL || "gpt-5.4";

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "YUNWU_API_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const systemPrompt = `你是 Midflow 智能协作助手，正在辅助一场产品群面讨论。你的职责：
- 根据用户的画布内容和语音转录，提供分析和建议
- 回答产品、市场、竞品相关问题
- 帮助总结讨论要点
- 语言简洁专业，适度使用 markdown 格式
- 用中文回复`;

  const apiMessages = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  if (!stream) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages: apiMessages, stream: false }),
    });
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Streaming response
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages: apiMessages, stream: true }),
  });

  if (!res.ok) {
    const err = await res.text();
    return new Response(JSON.stringify({ error: err }), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Forward the SSE stream directly
  return new Response(res.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
