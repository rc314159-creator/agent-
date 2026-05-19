"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, Square, Loader2 } from "lucide-react";

interface LiveLine {
  id: string;
  speakerId: string | null;
  speakerName: string;
  text: string;
  confidence: number;
  needsReview: boolean;
  status: "live" | "embedding" | "matched" | "error";
  startMs: number;
}

const SPEAKER_COLORS = [
  "bg-blue-500/15 text-blue-300 border-blue-500/30",
  "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "bg-pink-500/15 text-pink-300 border-pink-500/30",
  "bg-violet-500/15 text-violet-300 border-violet-500/30",
  "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  "bg-rose-500/15 text-rose-300 border-rose-500/30",
  "bg-lime-500/15 text-lime-300 border-lime-500/30",
];

function speakerColorFor(map: Map<string, number>, speakerId: string | null): string {
  if (!speakerId) return "bg-slate-500/15 text-slate-300 border-slate-500/30";
  if (!map.has(speakerId)) map.set(speakerId, map.size);
  return SPEAKER_COLORS[map.get(speakerId)! % SPEAKER_COLORS.length];
}

function formatElapsed(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export default function RecorderPage() {
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [autoMode, setAutoMode] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [lines, setLines] = useState<LiveLine[]>([]);
  const [status, setStatus] = useState<string>("");
  const colorMapRef = useRef(new Map<string, number>());

  // Refs for runtime state read by audio callbacks
  const elapsedRef = useRef(0);
  useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveBubbleRef = useRef<string | null>(null);

  // Live timer
  useEffect(() => {
    if (recording) {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [recording]);

  const writeLive = useCallback((text: string) => {
    if (!text.trim()) return;
    setLines((prev) => {
      const liveId = liveBubbleRef.current;
      if (liveId) {
        return prev.map((l) => (l.id === liveId ? { ...l, text } : l));
      }
      const id = `live-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      liveBubbleRef.current = id;
      return [
        ...prev,
        {
          id,
          speakerId: null,
          speakerName: "讲话中",
          text,
          confidence: 0,
          needsReview: false,
          status: "live" as const,
          startMs: elapsedRef.current * 1000,
        },
      ];
    });
  }, []);

  const stopRecording = useCallback(async () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) wsRef.current.close();
      wsRef.current = null;
    }
    setRecording(false);

    if (meetingId) {
      await fetch(`/api/meetings/${meetingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ end: true }),
      }).catch(() => {});
    }
  }, [meetingId]);

  const startRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("麦克风不可用");
      return;
    }
    setLines([]);
    setElapsed(0);
    liveBubbleRef.current = null;

    try {
      // 1) Create meeting
      const res = await fetch("/api/meetings", { method: "POST" });
      const m = await res.json();
      setMeetingId(m.id);
      setStatus(`会议已创建: ${m.title}`);

      // 2) Open mic
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      // 3) Connect ASR proxy via WebSocket
      const asrConfig = await fetch("/api/asr").then((r) => r.json());
      const ws = new WebSocket(asrConfig.wsUrl as string);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: "session.update",
            session: {
              input_audio_format: "pcm",
              sample_rate: 16000,
              input_audio_transcription: { language: "zh" },
              turn_detection: { type: "server_vad", threshold: 0.0, silence_duration_ms: 400 },
            },
          }),
        );
        source.connect(processor);
        processor.connect(audioCtx.destination);
      };

      let liveFinalized = "";

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data as string);
          const type: string = msg.type ?? "";
          if (type === "conversation.item.input_audio_transcription.text") {
            const confirmed: string = msg.text ?? "";
            const stash: string = msg.stash ?? "";
            writeLive((liveFinalized + confirmed + stash).trim());
          } else if (type === "conversation.item.input_audio_transcription.completed") {
            const t: string = (msg.transcript ?? "").trim();
            if (t) {
              liveFinalized = (liveFinalized + t).trim();
              writeLive(liveFinalized);
            }
          }
        } catch {
          /* ignore */
        }
      };

      ws.onerror = () => setStatus("语音识别连接异常");
      ws.onclose = () => {
        /* will be handled by stopRecording */
      };

      processor.onaudioprocess = (e) => {
        const ch = e.inputBuffer.getChannelData(0);
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        // Resample to 16kHz PCM Int16 + base64
        const outRate = 16000;
        const ratio = audioCtx.sampleRate / outRate;
        const outLen = Math.round(ch.length / ratio);
        const pcm = new Int16Array(outLen);
        for (let i = 0; i < outLen; i++) {
          const srcIdx = Math.min(Math.round(i * ratio), ch.length - 1);
          const v = Math.max(-1, Math.min(1, ch[srcIdx]));
          pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
        }
        const bytes = new Uint8Array(pcm.buffer);
        let bin = "";
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        wsRef.current.send(
          JSON.stringify({ type: "input_audio_buffer.append", audio: btoa(bin) }),
        );
      };

      setRecording(true);
      setStatus("录音中…");
    } catch (e) {
      setStatus(`启动失败: ${e instanceof Error ? e.message : String(e)}`);
      stopRecording();
    }
  }, [stopRecording, writeLive]);

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={recording ? stopRecording : startRecording}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            recording
              ? "bg-red-500/90 hover:bg-red-500 text-white shadow-[0_0_16px_rgba(239,68,68,0.4)]"
              : "bg-violet-600 hover:bg-violet-500 text-white"
          }`}
        >
          {recording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          {recording ? "停止录音" : "开始录音"}
        </button>
        {recording && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm text-red-400 font-mono tabular-nums">{formatElapsed(elapsed)}</span>
          </div>
        )}
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground select-none cursor-pointer">
          <input
            type="checkbox"
            checked={autoMode}
            onChange={(e) => setAutoMode(e.target.checked)}
            className="accent-violet-500"
          />
          自动模式
          <span className="text-[10px]">({autoMode ? "懒得选, 全自动" : "中等置信度让我确认"})</span>
        </label>
      </div>

      {status && (
        <div className="text-xs text-muted-foreground mb-4 bg-muted/30 rounded px-3 py-2">
          {status}
        </div>
      )}

      <div className="space-y-2">
        {lines.length === 0 && !recording && (
          <p className="text-sm text-muted-foreground text-center py-8">点击"开始录音"按钮开始。</p>
        )}
        {lines.map((l) => (
          <div
            key={l.id}
            className={`p-3 rounded-lg border ${
              l.needsReview ? "border-amber-500/40 bg-amber-500/5" : "border-border/40"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`text-[11px] px-2 py-0.5 rounded border ${speakerColorFor(colorMapRef.current, l.speakerId)}`}
              >
                {l.speakerName}
              </span>
              {l.status === "embedding" && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
              {l.status === "matched" && l.confidence > 0 && (
                <span className="text-[10px] text-muted-foreground">匹配 {Math.round(l.confidence * 100)}%</span>
              )}
              {l.status === "live" && (
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              )}
            </div>
            <p className="text-sm leading-relaxed">{l.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
