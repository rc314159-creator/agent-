import { getSetting } from "@/lib/db";
import { WebSocket } from "ws";

export const runtime = "nodejs";

const DEFAULT_ASR_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-asr-flash-realtime";

export async function POST() {
  const apiKey =
    getSetting("asr_api_key") ??
    getSetting("dashscope_api_key") ??
    process.env.DASHSCOPE_API_KEY;
  const wsUrl = getSetting("asr_ws_url") ?? DEFAULT_ASR_URL;

  if (!apiKey) {
    return Response.json({ ok: false, error: "未配置 ASR API Key" }, { status: 400 });
  }

  const start = Date.now();

  return new Promise<Response>((resolve) => {
    const timer = setTimeout(() => {
      ws.terminate();
      resolve(Response.json({ ok: false, error: "连接超时（5s）" }, { status: 504 }));
    }, 5000);

    const ws = new WebSocket(wsUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    ws.on("open", () => {
      clearTimeout(timer);
      ws.close();
      resolve(Response.json({ ok: true, latencyMs: Date.now() - start }));
    });

    ws.on("error", (err) => {
      clearTimeout(timer);
      ws.terminate();
      resolve(Response.json({ ok: false, error: err.message }, { status: 500 }));
    });

    ws.on("close", (code, reason) => {
      // closed before open fires — treat 1000 as success, others as errors
      if (code !== 1000 && code !== 1001) {
        clearTimeout(timer);
        resolve(Response.json({ ok: false, error: `WebSocket closed: ${code} ${reason.toString()}` }, { status: 500 }));
      }
    });
  });
}
