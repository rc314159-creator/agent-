import { NextRequest } from "next/server";

// POST /api/asr — returns ASR config for the client to connect directly via WebSocket
// The client establishes a WebSocket connection to DashScope directly from the browser
// This route just provides the authenticated config

export async function GET() {
  const apiKey = process.env.DASHSCOPE_API_KEY;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "DASHSCOPE_API_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      wsUrl: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
      apiKey,
      model: "qwen3-asr-flash-realtime",
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

// POST /api/asr — proxy for non-WebSocket ASR requests (e.g., file upload transcription)
export async function POST(req: NextRequest) {
  const apiKey = process.env.DASHSCOPE_API_KEY;

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "DASHSCOPE_API_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.json();

  const res = await fetch("https://dashscope.aliyuncs.com/api/v1/services/audio/asr/realtime", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "qwen3-asr-flash-realtime",
      ...body,
    }),
  });

  const data = await res.json();
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}
