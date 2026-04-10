/**
 * ASR WebSocket proxy — bridges browser WebSocket to DashScope.
 * Browser cannot set custom headers on WebSocket, but DashScope requires
 * Authorization header. This proxy connects server-side with proper headers
 * and relays messages bidirectionally.
 *
 * Uses Next.js 16 WebSocket upgrade support.
 */

import { apiLogger } from "@/lib/logger";

const log = apiLogger("asr-ws");

export function GET(req: Request) {
  // Check if this is a WebSocket upgrade request
  const upgradeHeader = req.headers.get("upgrade");
  if (upgradeHeader !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    return new Response("DASHSCOPE_API_KEY not configured", { status: 500 });
  }

  // @ts-expect-error — Next.js 16 experimental WebSocket support
  const { socket: clientSocket, response } = Deno?.upgradeWebSocket?.(req) ?? {};

  if (!clientSocket || !response) {
    // Fallback: return connection info for client to use alternative approach
    return new Response(
      JSON.stringify({
        error: "WebSocket upgrade not supported in this runtime. Use /api/asr for config.",
      }),
      { status: 501, headers: { "Content-Type": "application/json" } }
    );
  }

  log.info("ASR WebSocket proxy: client connected");

  // Connect to DashScope with proper auth headers
  const upstream = new WebSocket("wss://dashscope.aliyuncs.com/api-ws/v1/realtime", {
    // @ts-expect-error — headers supported in server-side WebSocket
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  // Relay: client → upstream
  clientSocket.onmessage = (event: MessageEvent) => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(event.data);
    }
  };

  // Relay: upstream → client
  upstream.onmessage = (event: MessageEvent) => {
    if (clientSocket.readyState === WebSocket.OPEN) {
      clientSocket.send(event.data);
    }
  };

  upstream.onclose = () => {
    log.info("ASR upstream closed");
    if (clientSocket.readyState === WebSocket.OPEN) clientSocket.close();
  };

  clientSocket.onclose = () => {
    log.info("ASR client disconnected");
    if (upstream.readyState === WebSocket.OPEN) upstream.close();
  };

  upstream.onerror = () => {
    log.error("ASR upstream error");
  };

  return response;
}
