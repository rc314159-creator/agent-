import { WebSocketServer, WebSocket } from 'ws';
import { appendFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import Database from 'better-sqlite3';

// DashScope Qwen3-ASR-Flash Realtime
// IMPORTANT: model MUST be passed as URL query param, not via session.update.
// If omitted, the server defaults to qwen-omni-turbo-realtime-* and closes the
// connection with "Model not found". See docs:
// https://help.aliyun.com/zh/model-studio/qwen-asr-realtime-api/
const DEFAULT_DASHSCOPE_URL =
  'wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-asr-flash-realtime';
const PORT = 4928;

function loadSettingsFromDb(): { url: string; apiKey: string } {
  try {
    const dbPath = process.env.VOICEPRINT_DB_PATH ?? resolve(process.cwd(), '../data/vp.db');
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const get = (key: string) =>
      (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value ?? null;
    const url = get('asr_ws_url') ?? DEFAULT_DASHSCOPE_URL;
    const apiKey =
      get('asr_api_key') ??
      get('dashscope_api_key') ??
      process.env.DASHSCOPE_API_KEY ??
      'sk-e2c4923387e147629d69b634dcb9a1a1';
    db.close();
    return { url, apiKey };
  } catch {
    return {
      url: DEFAULT_DASHSCOPE_URL,
      apiKey: process.env.DASHSCOPE_API_KEY ?? 'sk-e2c4923387e147629d69b634dcb9a1a1',
    };
  }
}

// Load once at startup; restart the proxy to pick up settings changes.
const { url: DASHSCOPE_URL, apiKey: API_KEY } = loadSettingsFromDb();

// Log to a file so errors are inspectable after the fact. Writing directly to
// the same logs/ dir used by the Next.js pino logger keeps everything in one
// place.
const LOG_FILE = resolve(process.cwd(), 'logs/asr-proxy.log');
try { mkdirSync(dirname(LOG_FILE), { recursive: true }); } catch { /* ignore */ }

function log(level: 'info' | 'warn' | 'error', msg: string, extra?: Record<string, unknown>) {
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    component: 'asr-proxy',
    msg,
    ...extra,
  });
  try { appendFileSync(LOG_FILE, line + '\n'); } catch { /* ignore */ }
  const fn = level === 'error' ? console.error : console.log;
  fn(`[asr-proxy] ${msg}`, extra ?? '');
}

const wss = new WebSocketServer({ port: PORT });
log('info', `ASR proxy listening on ws://localhost:${PORT}`);

let connectionId = 0;

wss.on('connection', (client) => {
  const cid = ++connectionId;
  log('info', 'client connected', { cid });

  const upstream = new WebSocket(DASHSCOPE_URL, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'OpenAI-Beta': 'realtime=v1',
    },
  });

  // Buffer messages that arrive before the upstream is ready
  const pendingToUpstream: Array<{ data: Buffer; isBinary: boolean }> = [];

  // Relay: client → DashScope. CRITICAL: must preserve the frame type
  // (TEXT vs BINARY). The `ws` library defaults `ws.send(Buffer)` to BINARY,
  // but DashScope rejects binary frames for JSON control messages with
  // "Internal server error" 1011. Always pass `{ binary }` explicitly.
  client.on('message', (data, isBinary) => {
    const buf = data as Buffer;
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(buf, { binary: isBinary });
    } else {
      pendingToUpstream.push({ data: buf, isBinary });
    }
  });

  upstream.on('open', () => {
    log('info', 'dashscope connected', { cid });
    for (const { data, isBinary } of pendingToUpstream) {
      upstream.send(data, { binary: isBinary });
    }
    pendingToUpstream.length = 0;
  });

  // Relay: DashScope → client. Also inspect server errors so we can log them.
  upstream.on('message', (data, isBinary) => {
    const raw = data.toString();
    // Non-audio control messages are small JSON; log errors/session events.
    if (raw.length < 2048) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.type === 'error') {
          log('error', 'dashscope error event', { cid, error: parsed.error });
        } else if (parsed?.type === 'session.created' || parsed?.type === 'session.updated') {
          log('info', `dashscope ${parsed.type}`, { cid, model: parsed.session?.model });
        }
      } catch { /* not JSON, ignore */ }
    }
    if (client.readyState === WebSocket.OPEN) {
      client.send(data, { binary: isBinary });
    }
  });

  upstream.on('close', (code, reason) => {
    log('warn', 'dashscope closed', { cid, code, reason: reason.toString() });
    if (client.readyState === WebSocket.OPEN) client.close();
  });

  client.on('close', () => {
    log('info', 'client closed', { cid });
    if (upstream.readyState === WebSocket.OPEN) upstream.close();
  });

  upstream.on('error', (err) => {
    log('error', 'dashscope socket error', { cid, message: err.message });
    if (client.readyState === WebSocket.OPEN) client.close();
  });

  client.on('error', (err) => {
    log('error', 'client socket error', { cid, message: err.message });
  });
});
