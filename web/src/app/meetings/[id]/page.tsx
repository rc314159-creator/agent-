"use client";

import { useEffect, useState, useCallback, use, useRef } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { ChevronLeft, AlertTriangle, Play, Pause, Sparkles, ChevronDown, ChevronRight, Loader2 } from "lucide-react";

interface UtteranceItem {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  speakerId: string;
  speakerName: string;
  confidence: number;
  needsReview: boolean;
  audioPath: string | null;
  createdAt: number;
}

interface Meeting {
  id: string;
  title: string | null;
  startedAt: number;
  endedAt: number | null;
}

interface ToolEvent {
  name: string;
  input: unknown;
  result?: unknown;
}

const COLOR_POOL = [
  "bg-blue-500/15 text-blue-300 border-blue-500/30",
  "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "bg-pink-500/15 text-pink-300 border-pink-500/30",
  "bg-violet-500/15 text-violet-300 border-violet-500/30",
  "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  "bg-rose-500/15 text-rose-300 border-rose-500/30",
  "bg-lime-500/15 text-lime-300 border-lime-500/30",
];

function speakerColor(idMap: Map<string, number>, speakerId: string): string {
  if (!idMap.has(speakerId)) idMap.set(speakerId, idMap.size);
  return COLOR_POOL[idMap.get(speakerId)! % COLOR_POOL.length];
}

function formatTime(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function ToolCallDisplay({ event }: { event: ToolEvent }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border/30 rounded-md text-xs mb-1.5 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-1.5 bg-muted/30 hover:bg-muted/50 text-left"
      >
        {open ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
        <span className="font-mono text-violet-300">{event.name}</span>
        {event.result !== undefined && <span className="text-emerald-400 ml-auto">完成</span>}
      </button>
      {open && (
        <div className="px-3 py-2 space-y-2">
          <div>
            <p className="text-muted-foreground mb-1">输入</p>
            <pre className="text-[11px] overflow-auto max-h-40 bg-muted/20 rounded p-2">{JSON.stringify(event.input, null, 2)}</pre>
          </div>
          {event.result !== undefined && (
            <div>
              <p className="text-muted-foreground mb-1">结果</p>
              <pre className="text-[11px] overflow-auto max-h-40 bg-muted/20 rounded p-2">{JSON.stringify(event.result, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [utterances, setUtterances] = useState<UtteranceItem[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Summary state
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryText, setSummaryText] = useState("");
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const [summaryError, setSummaryError] = useState("");
  const pendingToolRef = useRef<Map<string, ToolEvent>>(new Map());
  const colorMapRef = useRef(new Map<string, number>());

  useEffect(() => {
    fetch(`/api/meetings/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setMeeting(d.meeting ?? null);
        setUtterances(d.utterances ?? []);
      });
  }, [id]);

  // SSE: stream new utterances when meeting is still in progress
  useEffect(() => {
    if (!meeting) return;
    if (meeting.endedAt) return;

    setStreaming(true);
    const es = new EventSource(`/api/meetings/${id}/stream`);

    es.addEventListener("utterance", (e) => {
      try {
        const data = JSON.parse(e.data) as {
          utteranceId: string;
          speakerId: string;
          speakerName: string;
          text: string;
          confidence: number;
          needsReview: boolean;
          startMs: number;
          endMs: number;
        };
        const item: UtteranceItem = {
          id: data.utteranceId,
          text: data.text,
          startMs: data.startMs,
          endMs: data.endMs,
          speakerId: data.speakerId,
          speakerName: data.speakerName,
          confidence: data.confidence,
          needsReview: data.needsReview,
          audioPath: null,
          createdAt: Date.now(),
        };
        setUtterances((prev) => {
          if (prev.some((u) => u.id === item.id)) return prev;
          return [...prev, item];
        });
      } catch {
        /* ignore malformed events */
      }
    });

    // Poll every 5s to detect when recording ends
    const pollTimer = setInterval(async () => {
      try {
        const r = await fetch(`/api/meetings/${id}`);
        const d = await r.json();
        if (d.meeting?.endedAt) {
          setMeeting(d.meeting);
          setUtterances(d.utterances ?? []);
          setStreaming(false);
          es.close();
          clearInterval(pollTimer);
        }
      } catch { /* ignore */ }
    }, 5000);

    return () => {
      es.close();
      clearInterval(pollTimer);
      setStreaming(false);
    };
  }, [id, meeting?.endedAt]);

  // Auto-scroll bottom when new utterances arrive during live streaming
  useEffect(() => {
    if (streaming && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [utterances.length, streaming]);

  const togglePlay = useCallback(
    (utteranceId: string, audioPath: string) => {
      if (playing === utteranceId && audio) {
        audio.pause();
        setPlaying(null);
        return;
      }
      if (audio) audio.pause();
      const next = new Audio(`/api/segments/${audioPath}`);
      next.onended = () => setPlaying(null);
      next.play().catch(() => setPlaying(null));
      setAudio(next);
      setPlaying(utteranceId);
    },
    [audio, playing],
  );

  async function startSummary() {
    setSummaryLoading(true);
    setSummaryText("");
    setToolEvents([]);
    setSummaryError("");
    pendingToolRef.current.clear();

    try {
      const resp = await fetch(`/api/meetings/${id}/summary`, { method: "POST" });
      if (!resp.body) throw new Error("no body");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          const eventLine = part.split("\n").find((l) => l.startsWith("event: "));
          const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
          if (!eventLine || !dataLine) continue;
          const event = eventLine.slice(7).trim();
          const data = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;

          if (event === "text_delta") {
            setSummaryText((prev) => prev + (data.text as string ?? ""));
          } else if (event === "tool_use") {
            const ev: ToolEvent = { name: data.name as string, input: data.input };
            pendingToolRef.current.set(data.name as string, ev);
            setToolEvents((prev) => [...prev, ev]);
          } else if (event === "tool_result") {
            const pending = pendingToolRef.current.get(data.name as string);
            if (pending) {
              pending.result = data.result;
              setToolEvents((prev) => prev.map((e) => e === pending ? { ...e, result: data.result } : e));
            }
          } else if (event === "error") {
            setSummaryError(data.error as string ?? "未知错误");
          }
        }
      }
    } catch (e) {
      setSummaryError(String(e));
    } finally {
      setSummaryLoading(false);
    }
  }

  if (!meeting) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <p className="text-sm text-muted-foreground">加载中…</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <Link
        href="/meetings"
        className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground mb-3"
      >
        <ChevronLeft className="w-4 h-4" /> 返回历史会议
      </Link>
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{meeting.title}</h1>
          {streaming && (
            <span className="inline-flex items-center gap-1 text-xs text-red-400">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              录音中
            </span>
          )}
        </div>
        {utterances.length > 0 && (
          <button
            onClick={() => { setSummaryOpen(true); startSummary(); }}
            disabled={summaryLoading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-violet-600/80 hover:bg-violet-600 text-white disabled:opacity-50 transition-colors shrink-0 ml-3"
          >
            {summaryLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            AI 总结
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-6">
        {utterances.length} 句 · 开始于 {new Date(meeting.startedAt).toLocaleString("zh-CN")}
      </p>

      {/* Summary panel */}
      {summaryOpen && (
        <div className="mb-6 rounded-lg border border-violet-500/30 bg-violet-500/5 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-violet-400" /> AI 会议总结
            </h2>
            <button onClick={() => setSummaryOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">关闭</button>
          </div>

          {toolEvents.length > 0 && (
            <div className="mb-3">
              <p className="text-xs text-muted-foreground mb-1.5">工具调用</p>
              {toolEvents.map((ev, i) => <ToolCallDisplay key={i} event={ev} />)}
            </div>
          )}

          {summaryError && (
            <p className="text-xs text-red-400 mb-2">{summaryError}</p>
          )}

          {summaryLoading && !summaryText && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> 正在分析…
            </div>
          )}

          {summaryText && (
            <div className="prose prose-sm prose-invert max-w-none text-sm">
              <ReactMarkdown>{summaryText}</ReactMarkdown>
            </div>
          )}
        </div>
      )}

      {utterances.length === 0 ? (
        <p className="text-sm text-muted-foreground">这个会议还没有任何发言。</p>
      ) : (
        <ul className="space-y-2">
          {utterances.map((u) => (
            <li key={u.id} className="rounded-lg border border-border/40 p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className={`text-[11px] px-2 py-0.5 rounded border ${speakerColor(colorMapRef.current, u.speakerId)}`}
                >
                  {u.speakerName}
                </span>
                {u.needsReview && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                <span className="text-[11px] text-muted-foreground font-mono">{formatTime(u.startMs)}</span>
                <span className="text-[11px] text-muted-foreground ml-auto">匹配 {Math.round(u.confidence * 100)}%</span>
              </div>
              <p className="text-sm leading-relaxed">{u.text || <i className="text-muted-foreground">（无文字）</i>}</p>
              {u.audioPath && (
                <button
                  onClick={() => togglePlay(u.id, u.audioPath!)}
                  className="mt-2 inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-muted/60 hover:bg-muted"
                >
                  {playing === u.id ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  播放
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {streaming && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          实时字幕接收中…
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
