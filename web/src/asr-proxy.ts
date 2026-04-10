import { WebSocketServer, WebSocket } from 'ws';

const DASHSCOPE_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime';
const API_KEY = process.env.DASHSCOPE_API_KEY || 'sk-e2c4923387e147629d69b634dcb9a1a1';
const PORT = 4928;

const wss = new WebSocketServer({ port: PORT });
console.log(`ASR proxy listening on ws://localhost:${PORT}`);

wss.on('connection', (client) => {
  console.log('Client connected, connecting to DashScope...');

  const upstream = new WebSocket(DASHSCOPE_URL, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'OpenAI-Beta': 'realtime=v1',
    },
  });

  upstream.on('open', () => {
    console.log('DashScope connected');
  });

  // Relay: client → DashScope
  client.on('message', (data) => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data);
    }
  });

  // Relay: DashScope → client
  upstream.on('message', (data) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });

  upstream.on('close', () => {
    if (client.readyState === WebSocket.OPEN) client.close();
  });

  client.on('close', () => {
    if (upstream.readyState === WebSocket.OPEN) upstream.close();
  });

  upstream.on('error', (err) => {
    console.error('DashScope error:', err.message);
    if (client.readyState === WebSocket.OPEN) client.close();
  });
});
