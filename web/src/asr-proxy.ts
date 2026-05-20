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

// Reconnect policy: DashScope long sessions sometimes drop with "Internal
// service error". Auto-reconnect transparently to the client so a meeting
// recording isn't silently lost.
const MAX_RECONNECTS = 5;
const RECONNECT_WINDOW_MS = 60_000;
const RECONNECT_BACKOFF_MS = [200, 500, 1000, 2000, 4000];

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

const { url: DASHSCOPE_URL, apiKey: API_KEY } = loadSettingsFromDb();

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

  // ---- per-session state -----------------------------------------------
  let upstream: WebSocket | null = null;
  let reconnects = 0;
  const reconnectTimestamps: number[] = [];
  let lastSessionUpdate: { data: Buffer; isBinary: boolean } | null = null;
  let clientClosed = false;
  // Buffer messages that arrive before the upstream is ready
  const pendingToUpstream: Array<{ data: Buffer; isBinary: boolean }> = [];

  function notifyClient(payload: object) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(JSON.stringify(payload), { binary: false }); } catch { /* ignore */ }
    }
  }

  function connectUpstream() {
    const us = new WebSocket(DASHSCOPE_URL, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    });
    upstream = us;

    us.on('open', () => {
      log('info', 'dashscope connected', { cid, attempt: reconnects });
      // After a reconnect, resend the session.update so the upstream is
      // configured the same way the client expected.
      if (reconnects > 0 && lastSessionUpdate) {
        us.send(lastSessionUpdate.data, { binary: lastSessionUpdate.isBinary });
        log('info', 'replayed session.update after reconnect', { cid });
        notifyClient({ type: 'proxy.reconnected', cid, attempt: reconnects });
      }
      for (const { data, isBinary } of pendingToUpstream) {
        us.send(data, { binary: isBinary });
      }
      pendingToUpstream.length = 0;
    });

    us.on('message', (data, isBinary) => {
      const raw = data.toString();
      if (raw.length < 4096) {
        try {
          const parsed = JSON.parse(raw);
          const t = parsed?.type;
          if (t === 'error') {
            log('error', 'dashscope error event', { cid, error: parsed.error });
          } else if (t === 'session.created' || t === 'session.updated') {
            log('info', `dashscope ${t}`, { cid, model: parsed.session?.model });
          } else if (typeof t === 'string') {
            // verbose: log all non-audio control events so we can see real event names
            const preview = (parsed.text ?? parsed.transcript ?? parsed.delta ?? '').toString().slice(0, 80);
            log('info', `dashscope evt ${t}`, { cid, ...(preview ? { preview } : {}) });
          }
        } catch { /* not JSON */ }
      }
      if (client.readyState === WebSocket.OPEN) {
        client.send(data, { binary: isBinary });
      }
    });

    us.on('close', (code, reason) => {
      log('warn', 'dashscope closed', { cid, code, reason: reason.toString() });
      if (clientClosed) return;
      if (code === 1000) {
        // Clean close — propagate.
        if (client.readyState === WebSocket.OPEN) client.close();
        return;
      }
      // Abnormal close → try reconnect.
      tryReconnect();
    });

    us.on('error', (err) => {
      log('error', 'dashscope socket error', { cid, message: err.message });
      // The 'close' handler will fire after this and trigger the reconnect.
    });
  }

  function tryReconnect() {
    if (clientClosed) return;
    const now = Date.now();
    // Drop reconnect timestamps older than the window
    while (reconnectTimestamps.length && now - reconnectTimestamps[0] > RECONNECT_WINDOW_MS) {
      reconnectTimestamps.shift();
    }
    if (reconnectTimestamps.length >= MAX_RECONNECTS) {
      log('error', 'reconnect budget exhausted, closing client', { cid, attempts: reconnectTimestamps.length });
      notifyClient({ type: 'proxy.reconnect_failed', cid, message: '上游 ASR 服务多次重连失败' });
      if (client.readyState === WebSocket.OPEN) client.close();
      return;
    }
    reconnectTimestamps.push(now);
    reconnects += 1;
    const backoff = RECONNECT_BACKOFF_MS[Math.min(reconnects - 1, RECONNECT_BACKOFF_MS.length - 1)];
    log('warn', 'scheduling dashscope reconnect', { cid, attempt: reconnects, delayMs: backoff });
    notifyClient({ type: 'proxy.reconnecting', cid, attempt: reconnects, delayMs: backoff });
    setTimeout(() => {
      if (!clientClosed) connectUpstream();
    }, backoff);
  }

  // Client → upstream relay. Save session.update so we can replay on reconnect.
  // 加流量统计：每 50 条 audio append 汇报一次，便于排查"PCM 没到 DashScope"
  let audioAppendCount = 0;
  let bytesSent = 0;
  let lastReportAt = Date.now();
  client.on('message', (data, isBinary) => {
    const buf = data as Buffer;

    if (!isBinary) {
      const raw = buf.toString();
      if (raw.length < 4096) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.type === 'session.update') {
            lastSessionUpdate = { data: Buffer.from(buf), isBinary };
            log('info', 'client session.update', { cid, session: parsed.session });
          } else if (parsed?.type === 'input_audio_buffer.append') {
            audioAppendCount++;
            bytesSent += buf.length;
            const elapsed = Date.now() - lastReportAt;
            if (audioAppendCount % 50 === 0 || elapsed > 5000) {
              log('info', 'client → upstream PCM stat', {
                cid,
                appendCount: audioAppendCount,
                bytesSent,
                upstreamState: upstream?.readyState,
              });
              lastReportAt = Date.now();
            }
          } else if (parsed?.type) {
            log('info', `client → upstream ${parsed.type}`, { cid });
          }
        } catch { /* not JSON */ }
      }
    }

    if (upstream && upstream.readyState === WebSocket.OPEN) {
      upstream.send(buf, { binary: isBinary });
    } else {
      pendingToUpstream.push({ data: buf, isBinary });
      if (pendingToUpstream.length > 500) pendingToUpstream.shift();
    }
  });

  client.on('close', () => {
    log('info', 'client closed', { cid });
    clientClosed = true;
    if (upstream && upstream.readyState === WebSocket.OPEN) upstream.close();
  });

  client.on('error', (err) => {
    log('error', 'client socket error', { cid, message: err.message });
  });

  connectUpstream();
});
