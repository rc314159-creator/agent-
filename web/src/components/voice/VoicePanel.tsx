"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Mic,
  Square,
  Copy,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Check,
  Loader2,
} from "lucide-react";
import { useAIToggle } from "@/hooks/useAIToggle";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useProject } from "@/hooks/useProject";
import { SummaryDialog } from "@/components/voice/SummaryDialog";

const speakerColors: Record<string, string> = {
  "Speaker A": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "Speaker B": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "Speaker C": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "Speaker D": "bg-pink-500/20 text-pink-300 border-pink-500/30",
  "Speaker": "bg-violet-500/20 text-violet-300 border-violet-500/30",
};

// Pre-computed sine-wave heights — stable across renders, no Math.random()
const WAVE_BARS = 40;
const waveHeights = Array.from({ length: WAVE_BARS }, (_, i) => {
  const base = Math.sin((i / WAVE_BARS) * Math.PI * 3) * 0.35;
  const secondary = Math.sin((i / WAVE_BARS) * Math.PI * 7 + 1.2) * 0.25;
  return Math.max(0.1, 0.5 + base + secondary);
});

function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface TranscriptItem {
  id: number;
  speaker: string;
  text: string;
  time: string;
}

interface VoicePanelProps {
  width: number;
  onWidthChange: (w: number) => void;
}

// Resample Float32 audio to 16kHz PCM Int16 and return as base64
function resampleAndEncode(
  inputData: Float32Array,
  inputSampleRate: number
): string {
  const outputSampleRate = 16000;
  const ratio = inputSampleRate / outputSampleRate;
  const outputLength = Math.round(inputData.length / ratio);
  const pcm = new Int16Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = Math.min(Math.round(i * ratio), inputData.length - 1);
    const sample = Math.max(-1, Math.min(1, inputData[srcIndex]));
    pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  // Convert Int16Array to base64
  const bytes = new Uint8Array(pcm.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function VoicePanel({ width, onWidthChange }: VoicePanelProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [asrError, setAsrError] = useState<string | null>(null);
  const [summaryText, setSummaryText] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const { aiEnabled } = useAIToggle();
  const workspace = useWorkspace();
  const { saveField } = useProject();
  const dragStartX = useRef<number | null>(null);
  const dragStartWidth = useRef<number>(width);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ASR refs
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const transcriptIdRef = useRef(1);
  const elapsedRef = useRef(0);
  const reconnectAttemptRef = useRef(0);
  const MAX_RECONNECT = 3;
  // Streaming transcript state
  const currentStreamingRef = useRef<{ id: number; text: string } | null>(null);
  const speakerIndexRef = useRef(0);
  const SPEAKER_NAMES = ["Speaker A", "Speaker B", "Speaker C", "Speaker D"];

  // Keep elapsedRef in sync for use in audio callbacks
  useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);

  // Live timer
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  // Auto-scroll to bottom when new transcripts arrive
  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts]);

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragStartX.current = e.clientX;
      dragStartWidth.current = width;

      const onMove = (ev: MouseEvent) => {
        if (dragStartX.current === null) return;
        const delta = dragStartX.current - ev.clientX;
        const next = Math.min(500, Math.max(280, dragStartWidth.current + delta));
        onWidthChange(next);
      };
      const onUp = () => {
        dragStartX.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [width, onWidthChange]
  );

  const stopRecording = useCallback(() => {
    // Stop audio processing
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    // Close WebSocket
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
    setIsRecording(false);
    // Save transcripts to project data on stop
    setTranscripts((prev) => {
      if (prev.length > 0) {
        saveField("transcripts", prev);
      }
      return prev;
    });
  }, [saveField]);

  const connectASR = useCallback(async (audioContext: AudioContext, source: MediaStreamAudioSourceNode, processor: ScriptProcessorNode) => {
    try {
      const res = await fetch("/api/asr");
      if (!res.ok) throw new Error("ASR 配置获取失败");
      const { wsUrl, apiKey, model } = await res.json();

      const ws = new WebSocket(`${wsUrl}?authorization=${encodeURIComponent(`Bearer ${apiKey}`)}&OpenAI-Beta=realtime%3Dv1`);
      wsRef.current = ws;

      ws.onopen = () => {
        setAsrError(null);
        ws.send(JSON.stringify({
          type: "session.update",
          session: { model, input_audio_format: "pcm16", turn_detection: { type: "server_vad" } },
        }));
        // Start sending audio only after WebSocket is ready
        source.connect(processor);
        processor.connect(audioContext.destination);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          const type: string = msg.type ?? "";

          // New conversation item = new speaker turn (VAD detected speech boundary)
          if (type === "conversation.item.created") {
            // Finalize any in-progress streaming item
            if (currentStreamingRef.current) {
              currentStreamingRef.current = null;
            }
            // Rotate speaker for the new turn
            speakerIndexRef.current = (speakerIndexRef.current + 1) % SPEAKER_NAMES.length;
          }

          // Streaming delta — append to current item in real-time
          if (type === "response.audio_transcript.delta") {
            const delta = msg.delta ?? "";
            if (!delta) return;

            if (!currentStreamingRef.current) {
              // Start a new streaming item
              const id = transcriptIdRef.current++;
              currentStreamingRef.current = { id, text: delta };
              const speaker = SPEAKER_NAMES[speakerIndexRef.current];
              setTranscripts((prev) => {
                const updated = [...prev, {
                  id,
                  speaker,
                  text: delta,
                  time: formatTimestamp(elapsedRef.current),
                }];
                workspace.setTranscripts(updated);
                return updated;
              });
            } else {
              // Append delta to existing streaming item
              currentStreamingRef.current.text += delta;
              const streamId = currentStreamingRef.current.id;
              const fullText = currentStreamingRef.current.text;
              setTranscripts((prev) => {
                const updated = prev.map((t) =>
                  t.id === streamId ? { ...t, text: fullText } : t
                );
                workspace.setTranscripts(updated);
                return updated;
              });
            }
          }

          // Completed transcription — finalize the item
          if (type === "conversation.item.input_audio_transcription.completed") {
            const text = msg.transcript ?? "";
            if (text.trim()) {
              if (currentStreamingRef.current) {
                // Update the streaming item with final text
                const streamId = currentStreamingRef.current.id;
                currentStreamingRef.current = null;
                setTranscripts((prev) => {
                  const updated = prev.map((t) =>
                    t.id === streamId ? { ...t, text: text.trim() } : t
                  );
                  workspace.setTranscripts(updated);
                  return updated;
                });
              } else {
                // No streaming item, add as new completed item
                const speaker = SPEAKER_NAMES[speakerIndexRef.current];
                const newItem = {
                  id: transcriptIdRef.current++,
                  speaker,
                  text: text.trim(),
                  time: formatTimestamp(elapsedRef.current),
                };
                setTranscripts((prev) => {
                  const updated = [...prev, newItem];
                  workspace.setTranscripts(updated);
                  return updated;
                });
              }
            }
          }
        } catch { /* ignore */ }
      };

      ws.onerror = () => {
        setAsrError("语音识别连接失败，录音继续中");
        wsRef.current = null;
      };

      ws.onclose = () => {
        if (wsRef.current) {
          wsRef.current = null;
          // Auto-reconnect if still recording
          if (reconnectAttemptRef.current < MAX_RECONNECT) {
            reconnectAttemptRef.current++;
            setAsrError(`语音识别断开，${5}秒后自动重连 (${reconnectAttemptRef.current}/${MAX_RECONNECT})...`);
            setTimeout(() => {
              if (audioContextRef.current && processorRef.current) {
                connectASR(audioContext, source, processor);
              }
            }, 5000);
          } else {
            setAsrError("语音识别已断开（重连次数已达上限），请手动重新开始录制");
          }
        }
      };

      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        const channelData = e.inputBuffer.getChannelData(0);
        const base64 = resampleAndEncode(channelData, audioContext.sampleRate);
        wsRef.current.send(JSON.stringify({ type: "input_audio_buffer.append", audio: base64 }));
      };
    } catch {
      setAsrError("语音识别暂不可用，录音继续中");
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      // Step 1: Get microphone FIRST — this is the core functionality
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      // Step 2: Recording is now active
      setTranscripts([]);
      workspace.setTranscripts([]);
      setIsLive(true);
      setElapsed(0);
      setAsrError(null);
      transcriptIdRef.current = 1;
      reconnectAttemptRef.current = 0;
      setIsRecording(true);

      // Step 3: Try to connect ASR (non-blocking — recording works even if ASR fails)
      connectASR(audioContext, source, processor);
    } catch {
      // Only fail if microphone access is denied
      setAsrError("麦克风权限被拒绝");
      stopRecording();
    }
  }, [stopRecording, connectASR, workspace]);

  const handleToggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const handleCopyItem = useCallback(async (id: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // clipboard unavailable
    }
  }, []);

  const handleGenerateSummary = useCallback(async () => {
    if (transcripts.length === 0) return;
    setSummaryLoading(true);
    setSummaryText("");
    try {
      const transcriptText = transcripts
        .map((t) => `[${t.speaker}] ${t.time}: ${t.text}`)
        .join("\n");
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: `请根据以下会议转录内容，生成一份结构化的会议总结报告。要求包含：核心要点、详细总结、行动项。使用 Markdown 格式。\n\n转录内容：\n${transcriptText}`,
            },
          ],
          stream: false,
        }),
      });
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content ?? "";
      setSummaryText(content);
      setSummaryOpen(true);
    } catch {
      setSummaryText("生成失败，请重试。");
      setSummaryOpen(true);
    } finally {
      setSummaryLoading(false);
    }
  }, [transcripts]);

  const handleCopyAll = useCallback(async () => {
    const allText = transcripts
      .map((t) => `[${t.speaker}] ${t.time}\n${t.text}`)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(allText);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    } catch {
      // clipboard unavailable
    }
  }, [transcripts]);

  if (collapsed) {
    return (
      <div className="w-10 border-l border-border/50 bg-background/60 backdrop-blur-xl flex flex-col items-center py-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 mb-2"
          onClick={() => setCollapsed(false)}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center">
          <Mic className="w-3 h-3 text-red-400" />
        </div>
      </div>
    );
  }

  return (
    <>
      <aside
        className="border-l border-border/50 bg-background/60 backdrop-blur-xl flex flex-col shrink-0 relative overflow-hidden"
        style={{ width }}
      >
        {/* Drag handle */}
        <div
          onMouseDown={handleDragStart}
          className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize group z-10 hover:bg-violet-500/40 transition-colors"
          title="拖拽调整宽度"
        >
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-12 rounded-full bg-border/0 group-hover:bg-violet-400/60 transition-colors" />
        </div>

        {/* Header */}
        <div className="h-10 border-b border-border/30 flex items-center justify-between px-3 shrink-0">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            语音录制
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setCollapsed(true)}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Recording controls */}
        <div className="p-4 border-b border-border/30 space-y-3">
          <div className="flex items-center justify-between">
            <Button
              variant={isRecording ? "destructive" : "default"}
              size="sm"
              onClick={handleToggleRecording}
              className={`gap-2 transition-all ${isRecording ? "shadow-[0_0_12px_rgba(239,68,68,0.4)]" : ""}`}
            >
              {isRecording ? (
                <>
                  <Square className="w-3.5 h-3.5" />
                  停止录制
                </>
              ) : (
                <>
                  <Mic className="w-3.5 h-3.5" />
                  开始录制
                </>
              )}
            </Button>
            {isRecording && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs text-red-400 font-mono tabular-nums">
                  {formatTimer(elapsed)}
                </span>
              </div>
            )}
          </div>

          {/* ASR status */}
          {asrError && isRecording && (
            <div className="text-[10px] text-amber-400/80 bg-amber-500/10 rounded px-2 py-1 border border-amber-500/20">
              {asrError}
            </div>
          )}

          {/* Waveform */}
          <div className="h-12 rounded-lg bg-muted/30 border border-border/30 flex items-center justify-center overflow-hidden px-2">
            {isRecording ? (
              <div className="flex items-end gap-px h-8 w-full">
                {waveHeights.map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-full"
                    style={{
                      background:
                        "linear-gradient(to top, oklch(0.62 0.23 290), oklch(0.74 0.18 260))",
                      height: `${h * 100}%`,
                      animation: `voiceWaveBar ${0.8 + (i % 5) * 0.12}s ease-in-out infinite alternate`,
                      animationDelay: `${(i * 35) % 400}ms`,
                    }}
                  />
                ))}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                点击录制按钮开始
              </span>
            )}
          </div>
        </div>

        {/* Transcript list */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-3 space-y-2">
            {transcripts.map((item, index) => {
              const isStreaming = currentStreamingRef.current?.id === item.id;
              return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: isLive ? 0 : index * 0.04, duration: 0.2, ease: "easeOut" }}
                className={`group p-2.5 rounded-lg hover:bg-muted/30 transition-colors ${isStreaming ? "bg-violet-500/5 border border-violet-500/20" : ""}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 shrink-0 ${speakerColors[item.speaker] || ""}`}
                  >
                    {item.speaker}
                  </Badge>
                  {isStreaming && (
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                  )}
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {item.time}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={() => handleCopyItem(item.id, item.text)}
                  >
                    {copiedId === item.id ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </Button>
                </div>
                <p className="text-xs leading-relaxed text-foreground/80">
                  {item.text}
                  {isStreaming && (
                    <span className="inline-block w-0.5 h-3 bg-violet-400 animate-pulse ml-0.5 align-middle" />
                  )}
                </p>
              </motion.div>
              );
            })}
            <div ref={scrollEndRef} />
          </div>
        </ScrollArea>

        {/* Bottom actions */}
        <div className="p-3 border-t border-border/30 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs gap-1.5"
            onClick={handleCopyAll}
          >
            {copiedAll ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                已复制
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                复制全部
              </>
            )}
          </Button>
          {aiEnabled && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs gap-1.5 border-violet-500/30 text-violet-300 hover:bg-violet-500/10"
              onClick={handleGenerateSummary}
              disabled={summaryLoading || transcripts.length === 0}
            >
              {summaryLoading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              {summaryLoading ? "生成中..." : "一键总结"}
            </Button>
          )}
        </div>
      </aside>

      <SummaryDialog
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        summary={summaryText}
        loading={summaryLoading}
      />

      <style>{`
        @keyframes voiceWaveBar {
          from { transform: scaleY(0.35); opacity: 0.55; }
          to   { transform: scaleY(1);    opacity: 1; }
        }
      `}</style>
    </>
  );
}
