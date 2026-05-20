"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Mic, Square, Loader2, AlertTriangle, Check } from "lucide-react";
import { concatChunks, resampleToInt16, encodeWav, int16ToBase64 } from "@/lib/wav";
import { AudioSourcePicker, type AudioSourceMode } from "@/components/AudioSourcePicker";
import { MicrophoneTester } from "@/components/MicrophoneTester";

interface LiveLine {
  id: string;
  speakerId: string | null;
  speakerName: string;
  text: string;
  confidence: number;
  needsReview: boolean;
  isNewSpeaker: boolean;
  status: "live" | "embedding" | "matched" | "error";
  startMs: number;
  utteranceId?: string;
}

interface OtherSpeaker {
  id: string;
  name: string;
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

function speakerColorFor(map: Map<string, number>, speakerId: string | null, status: string): string {
  if (status === "live") return "bg-slate-500/15 text-slate-300 border-slate-500/30";
  if (status === "embedding") return "bg-slate-500/15 text-slate-400 border-slate-500/30";
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

const SOURCE_LABELS: Record<AudioSourceMode, string> = {
  microphone: "麦克风",
  system: "系统音频",
  mixed: "麦克风 + 系统音频",
};

export default function RecorderPage() {
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [autoMode, setAutoMode] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [lines, setLines] = useState<LiveLine[]>([]);
  const [status, setStatus] = useState<string>("");
  const [vpHealthy, setVpHealthy] = useState<boolean | null>(null);
  const [others, setOthers] = useState<OtherSpeaker[]>([]);
  // ASR 连接状态: "ok" 正常 / "reconnecting" proxy 重连中 / "lost" 连接已死
  const [asrConn, setAsrConn] = useState<"ok" | "reconnecting" | "lost">("ok");
  const [asrConnDetail, setAsrConnDetail] = useState<string>("");
  const colorMapRef = useRef(new Map<string, number>());

  // Audio source configuration state — 默认收起，从 localStorage 加载上次选择
  const [audioMode, setAudioMode] = useState<AudioSourceMode>("microphone");
  const [micDeviceId, setMicDeviceId] = useState<string>("");
  const [showSetup, setShowSetup] = useState(false);

  // Restore last-used source from localStorage so 1-click 直接录用上次的配置
  useEffect(() => {
    try {
      const m = localStorage.getItem("vp:audioMode");
      if (m === "microphone" || m === "system" || m === "mixed") setAudioMode(m);
      const d = localStorage.getItem("vp:micDeviceId");
      if (d) setMicDeviceId(d);
    } catch {/* ignore */}
  }, []);

  // ---- refs read by audio callbacks ----
  const recordingStartRef = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveBubbleRef = useRef<string | null>(null);

  // PCM buffer + segment slicing state
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const pcmSampleRateRef = useRef<number>(16000);
  const segStartChunkRef = useRef(0);
  const segStartMsRef = useRef(0);
  const liveFinalizedRef = useRef("");
  const meetingIdRef = useRef<string | null>(null);
  const autoModeRef = useRef<boolean>(true);

  useEffect(() => {
    meetingIdRef.current = meetingId;
  }, [meetingId]);
  useEffect(() => {
    autoModeRef.current = autoMode;
  }, [autoMode]);

  // Voiceprint service health check
  useEffect(() => {
    fetch("/api/voiceprint-health")
      .then((r) => r.json())
      .then((d) => setVpHealthy(!!d.ok))
      .catch(() => setVpHealthy(false));
  }, []);

  // Load other speakers list for "move to" dropdown
  const loadOthers = useCallback(async () => {
    try {
      const res = await fetch("/api/speakers");
      const data = await res.json();
      setOthers(
        (data.speakers ?? []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })),
      );
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    loadOthers();
  }, [loadOthers]);

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

  const writeLive = useCallback((text: string, startMs: number) => {
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
          isNewSpeaker: false,
          status: "live",
          startMs,
        },
      ];
    });
  }, []);

  const flushSegment = useCallback(
    async (text: string, segStart: number, segEnd: number) => {
      const meeting = meetingIdRef.current;
      if (!meeting) return;
      const chunks = pcmChunksRef.current;
      const sr = pcmSampleRateRef.current;
      const startIdx = segStartChunkRef.current;
      const endIdx = chunks.length;
      segStartChunkRef.current = endIdx;
      const slice = chunks.slice(startIdx, endIdx);
      if (slice.length === 0) return;
      const segPcm = concatChunks(slice);
      const segMs = Math.floor((segPcm.length / sr) * 1000);
      if (segMs < 300) return;

      const pcm16 = resampleToInt16(segPcm, sr, 16000);
      const wav = encodeWav(pcm16, 16000);

      const placeholderId = `seg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const liveId = liveBubbleRef.current;
      liveBubbleRef.current = null;
      setLines((prev) => {
        if (liveId) {
          return prev.map((l) =>
            l.id === liveId
              ? { ...l, id: placeholderId, status: "embedding" as const, speakerName: "归属中…", text }
              : l,
          );
        }
        return [
          ...prev,
          {
            id: placeholderId,
            speakerId: null,
            speakerName: "归属中…",
            text,
            confidence: 0,
            needsReview: false,
            isNewSpeaker: false,
            status: "embedding",
            startMs: segStart,
          },
        ];
      });

      try {
        const params = new URLSearchParams({
          meetingId: meeting,
          text,
          startMs: String(segStart),
          endMs: String(segEnd),
        });
        if (autoModeRef.current) params.set("autoMode", "1");
        const res = await fetch(`/api/utterances/ingest?${params.toString()}`, {
          method: "POST",
          headers: { "Content-Type": "audio/wav" },
          body: wav,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setLines((prev) =>
          prev.map((l) =>
            l.id === placeholderId
              ? {
                  ...l,
                  speakerId: data.speakerId,
                  speakerName: data.speakerName,
                  confidence: data.confidence,
                  needsReview: !!data.needsReview,
                  isNewSpeaker: !!data.isNewSpeaker,
                  status: "matched" as const,
                  utteranceId: data.utteranceId,
                }
              : l,
          ),
        );
        loadOthers();
      } catch (e) {
        setLines((prev) =>
          prev.map((l) =>
            l.id === placeholderId
              ? { ...l, speakerName: "归属失败", status: "error" as const }
              : l,
          ),
        );
        setStatus(`声纹匹配失败: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [loadOthers],
  );

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
    if (displayStreamRef.current) {
      displayStreamRef.current.getTracks().forEach((t) => t.stop());
      displayStreamRef.current = null;
    }
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) wsRef.current.close();
      wsRef.current = null;
    }
    setRecording(false);
    setAsrConn("ok");
    setAsrConnDetail("");
    setStatus("已停止。会议已归档, 可到历史会议查看。");

    if (meetingIdRef.current) {
      await fetch(`/api/meetings/${meetingIdRef.current}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ end: true }),
      }).catch(() => {});
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (vpHealthy === false) {
      setStatus("声纹服务未启动 (4929 不可达)。请先 `docker compose up voiceprint-service`。");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("麦克风不可用");
      return;
    }

    setShowSetup(false);
    setLines([]);
    setElapsed(0);
    pcmChunksRef.current = [];
    segStartChunkRef.current = 0;
    segStartMsRef.current = 0;
    liveFinalizedRef.current = "";
    liveBubbleRef.current = null;
    recordingStartRef.current = Date.now();

    try {
      const mRes = await fetch("/api/meetings", { method: "POST" });
      const m = await mRes.json();
      setMeetingId(m.id);
      meetingIdRef.current = m.id;
      setStatus(`录音中: ${m.title} — ${SOURCE_LABELS[audioMode]}`);

      // Acquire audio stream(s) based on selected mode
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      pcmSampleRateRef.current = audioCtx.sampleRate;

      let captureStream: MediaStream;

      if (audioMode === "microphone") {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: micDeviceId ? { deviceId: { exact: micDeviceId } } : true,
        });
        streamRef.current = s;
        captureStream = s;
      } else if (audioMode === "system") {
        // getDisplayMedia: video:false so user only sees audio share prompt
        const ds = await navigator.mediaDevices.getDisplayMedia({
          video: true, // some browsers require video:true to show the picker
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
          },
        });
        // Drop video tracks immediately
        ds.getVideoTracks().forEach((t) => t.stop());
        displayStreamRef.current = ds;
        captureStream = ds;
      } else {
        // mixed: merge mic + system into a single AudioContext destination stream
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: micDeviceId ? { deviceId: { exact: micDeviceId } } : true,
        });
        const sysStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
          },
        });
        sysStream.getVideoTracks().forEach((t) => t.stop());
        streamRef.current = micStream;
        displayStreamRef.current = sysStream;

        const micSrc = audioCtx.createMediaStreamSource(micStream);
        const sysSrc = audioCtx.createMediaStreamSource(sysStream);
        const dest = audioCtx.createMediaStreamDestination();
        micSrc.connect(dest);
        sysSrc.connect(dest);
        captureStream = dest.stream;
      }

      const source = audioCtx.createMediaStreamSource(captureStream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      const asrConfig = await fetch("/api/asr").then((r) => r.json());
      const ws = new WebSocket(asrConfig.wsUrl as string);
      wsRef.current = ws;

      ws.onopen = () => {
        // R7 历史可工作配置：pcm + sample_rate 16000，input_audio_transcription 只含 language
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

      ws.onmessage = async (evt) => {
        try {
          const msg = JSON.parse(evt.data as string);
          const type: string = msg.type ?? "";

          // 实时部分文本（DashScope 用 .text；OpenAI 标准用 .delta；两者都接）
          if (
            type === "conversation.item.input_audio_transcription.text" ||
            type === "conversation.item.input_audio_transcription.delta"
          ) {
            const confirmed: string = msg.text ?? msg.delta ?? "";
            const stash: string = msg.stash ?? "";
            const t = (liveFinalizedRef.current + confirmed + stash).trim();
            const startMs = segStartMsRef.current;
            if (t) writeLive(t, startMs);
          } else if (type === "conversation.item.input_audio_transcription.completed") {
            const piece = (msg.transcript ?? msg.text ?? "").trim();
            if (!piece) return;
            const fullText = (liveFinalizedRef.current + piece).trim();
            liveFinalizedRef.current = "";
            const segStart = segStartMsRef.current;
            const segEnd = Date.now() - recordingStartRef.current;
            segStartMsRef.current = segEnd;
            void flushSegment(fullText, segStart, segEnd);
          } else if (type === "input_audio_buffer.speech_started") {
            if (!liveBubbleRef.current) {
              segStartMsRef.current = Date.now() - recordingStartRef.current;
            }
          } else if (type === "error") {
            console.error("[ASR error]", msg);
            setAsrConn("lost");
            setAsrConnDetail(`ASR 错误: ${JSON.stringify(msg.error ?? msg).slice(0, 200)}`);
          } else if (type === "proxy.reconnecting") {
            setAsrConn("reconnecting");
            setAsrConnDetail(`正在重连 ASR (第 ${msg.attempt} 次，${msg.delayMs}ms 后)…`);
          } else if (type === "proxy.reconnected") {
            setAsrConn("ok");
            setAsrConnDetail("");
          } else if (type === "proxy.reconnect_failed") {
            setAsrConn("lost");
            setAsrConnDetail(msg.message ?? "ASR 上游多次重连失败，请停止录音后刷新页面重启");
          }
        } catch (e) {
          console.error("[ASR msg parse error]", e, evt.data);
        }
      };

      ws.onerror = () => {
        setAsrConn("lost");
        setAsrConnDetail("WebSocket 错误：与 ASR 代理的连接出问题，可能没在录音");
      };
      ws.onclose = () => {
        // 录音中 WS 被关闭 = 异常，警告用户而不是悄悄继续
        if (wsRef.current === ws) {
          setAsrConn("lost");
          setAsrConnDetail("ASR 连接已断开，当前不在录音状态。请停止后刷新页面重试");
        }
      };

      processor.onaudioprocess = (e) => {
        const ch = e.inputBuffer.getChannelData(0);
        pcmChunksRef.current.push(new Float32Array(ch));
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        const pcm16 = resampleToInt16(ch, audioCtx.sampleRate, 16000);
        wsRef.current.send(
          JSON.stringify({ type: "input_audio_buffer.append", audio: int16ToBase64(pcm16) }),
        );
      };

      setRecording(true);
    } catch (e) {
      setStatus(`启动失败: ${e instanceof Error ? e.message : String(e)}`);
      stopRecording();
    }
  }, [flushSegment, stopRecording, vpHealthy, writeLive, audioMode, micDeviceId]);

  const moveLine = useCallback(
    async (line: LiveLine, targetSpeakerId: string) => {
      if (!line.utteranceId) return;
      await fetch(`/api/utterances/${line.utteranceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speakerId: targetSpeakerId }),
      });
      const target = others.find((o) => o.id === targetSpeakerId);
      setLines((prev) =>
        prev.map((l) =>
          l.id === line.id
            ? { ...l, speakerId: targetSpeakerId, speakerName: target?.name ?? l.speakerName, needsReview: false }
            : l,
        ),
      );
      loadOthers();
    },
    [others, loadOthers],
  );

  const confirmLine = useCallback(async (line: LiveLine) => {
    if (!line.utteranceId) return;
    await fetch(`/api/utterances/${line.utteranceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, needsReview: false } : l)));
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Top bar — 一键直录，录音源选择折叠到 disclosure */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {!recording ? (
          <>
            <button
              onClick={startRecording}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-all shadow-md"
            >
              <Mic className="w-4 h-4" />
              开始录音
            </button>
            <button
              onClick={() => setShowSetup((v) => !v)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-2 rounded border border-border/40 hover:bg-muted/40 text-muted-foreground transition-colors"
              title="切换录音源 / 测试麦克风"
            >
              <span>{showSetup ? "▾" : "▸"}</span>
              <span>{SOURCE_LABELS[audioMode]}</span>
            </button>
          </>
        ) : (
          <>
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-red-500/90 hover:bg-red-500 text-white shadow-[0_0_16px_rgba(239,68,68,0.4)] transition-all"
            >
              <Square className="w-4 h-4" />
              停止录音
            </button>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm text-red-400 font-mono tabular-nums">{formatElapsed(elapsed)}</span>
              <span className="text-xs text-muted-foreground">{SOURCE_LABELS[audioMode]}</span>
            </div>
          </>
        )}
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground select-none cursor-pointer">
          <input
            type="checkbox"
            checked={autoMode}
            onChange={(e) => setAutoMode(e.target.checked)}
            className="accent-violet-500"
          />
          自动模式
        </label>
      </div>

      {/* 录音源 disclosure（折叠的）— 默认收起，点 disclosure 才展开 */}
      {showSetup && !recording && (
        <div className="mb-4 p-4 rounded-lg border border-border/40 bg-muted/10 space-y-4">
          <AudioSourcePicker
            mode={audioMode}
            micDeviceId={micDeviceId}
            onModeChange={(m) => { setAudioMode(m); try { localStorage.setItem("vp:audioMode", m); } catch {/* ignore */} }}
            onMicDeviceChange={(id) => { setMicDeviceId(id); try { localStorage.setItem("vp:micDeviceId", id); } catch {/* ignore */} }}
          />
          {(audioMode === "microphone" || audioMode === "mixed") && (
            <MicrophoneTester micDeviceId={micDeviceId} active={showSetup && !recording} />
          )}
        </div>
      )}

      {vpHealthy === false && (
        <div className="text-xs text-amber-300 mb-3 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2">
          声纹服务未连接 (localhost:4929)。先在终端跑:
          <code className="ml-1 px-1.5 py-0.5 bg-black/30 rounded">docker compose up -d voiceprint-service</code>
        </div>
      )}
      {recording && asrConn !== "ok" && (
        <div className={`text-xs mb-3 rounded px-3 py-2 border ${
          asrConn === "lost"
            ? "text-red-200 bg-red-500/15 border-red-500/40 animate-pulse"
            : "text-amber-200 bg-amber-500/10 border-amber-500/30"
        }`}>
          <strong>{asrConn === "lost" ? "⚠️ ASR 已断开" : "🔄 重连中"}</strong>
          {asrConnDetail ? ` — ${asrConnDetail}` : ""}
        </div>
      )}
      {status && (
        <div className="text-xs text-muted-foreground mb-3 bg-muted/30 rounded px-3 py-2">
          {status}
        </div>
      )}

      {/* Live transcript */}
      <div className="space-y-2">
        {lines.length === 0 && !recording && (
          <p className="text-sm text-muted-foreground text-center py-12">
            点击 <span className="text-foreground">开始录音</span> 开始。
            录音结束后可到 <Link href="/voiceprints" className="underline">声纹库</Link> 或{" "}
            <Link href="/meetings" className="underline">历史会议</Link> 查看。
          </p>
        )}
        {lines.map((l) => {
          const showOptions = l.status === "matched" && (l.needsReview || l.isNewSpeaker);
          return (
            <div
              key={l.id}
              className={`p-3 rounded-lg border ${
                l.needsReview ? "border-amber-500/40 bg-amber-500/5" : "border-border/40"
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className={`text-[11px] px-2 py-0.5 rounded border ${speakerColorFor(colorMapRef.current, l.speakerId, l.status)}`}
                >
                  {l.speakerName}
                </span>
                {l.status === "embedding" && (
                  <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                )}
                {l.needsReview && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                {l.status === "matched" && l.confidence > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    匹配 {Math.round(l.confidence * 100)}%
                  </span>
                )}
                {l.status === "live" && (
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                )}
              </div>
              <p className="text-sm leading-relaxed">{l.text}</p>
              {showOptions && (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  {l.needsReview && (
                    <button
                      onClick={() => confirmLine(l)}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                    >
                      <Check className="w-3 h-3" /> 确认
                    </button>
                  )}
                  <select
                    className="text-xs px-2 py-1 rounded bg-muted/60 border border-border/40 outline-none"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) moveLine(l, e.target.value);
                    }}
                  >
                    <option value="">移到…</option>
                    {others
                      .filter((o) => o.id !== l.speakerId)
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
