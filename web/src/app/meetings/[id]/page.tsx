"use client";

import { useEffect, useState, useCallback, use, useRef } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { ChevronLeft, AlertTriangle, Play, Pause, Send, Download, ChevronDown, ChevronRight, Loader2, MessageSquare } from "lucide-react";

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

interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  toolEvents?: ToolEvent[];
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

const PROMPT_CHIPS = [
  { label: "帮我总结这次会议", message: "请帮我总结这次会议的核心内容，包括议题、结论和待办事项。" },
  { label: "列出所有待办事项", message: "请从这次会议记录中提取所有待办事项，并标明负责人（如有提及）。" },
  { label: "分析各人发言", message: "请分析这次会议中每位参与者的发言情况，包括发言次数、主要观点和角色定位。" },
  { label: "关键决策", message: "这次会议做出了哪些关键决策？每条决策的背景和依据是什么？" },
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
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const colorMapRef = useRef(new Map<string, number>());

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chipsVisible, setChipsVisible] = useState(true);
  const pendingToolRef = useRef<Map<string, ToolEvent>>(new Map());
  const streamingMsgRef = useRef<string>("");

  useEffect(() => {
    fetch(`/api/meetings/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setMeeting(d.meeting ?? null);
        setUtterances(d.utterances ?? []);
      });
    // Load chat history
    fetch(`/api/meetings/${id}/chat`)
      .then((r) => r.json())
      .then((d: { messages: Array<{ id: string; role: "user" | "assistant"; content: string }> }) => {
        if (d.messages?.length > 0) {
          setMessages(d.messages.map((m) => ({ id: m.id, role: m.role, content: m.content })));
          setChipsVisible(false);
        }
      })
      .catch(() => {});
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
          utteranceId: string; speakerId: string; speakerName: string;
          text: string; confidence: number; needsReview: boolean;
          startMs: number; endMs: number;
        };
        const item: UtteranceItem = {
          id: data.utteranceId, text: data.text, startMs: data.startMs, endMs: data.endMs,
          speakerId: data.speakerId, speakerName: data.speakerName,
          confidence: data.confidence, needsReview: data.needsReview,
          audioPath: null, createdAt: Date.now(),
        };
        setUtterances((prev) => {
          if (prev.some((u) => u.id === item.id)) return prev;
          return [...prev, item];
        });
      } catch { /* ignore */ }
    });

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

  useEffect(() => {
    if (streaming && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [utterances.length, streaming]);

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

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

  async function sendMessage(text: string) {
    if (!text.trim() || chatLoading) return;
    setChatLoading(true);
    setChatError("");
    setChipsVisible(false);
    pendingToolRef.current.clear();
    streamingMsgRef.current = "";

    const userMsg: ChatMessage = { role: "user", content: text };
    const assistantMsg: ChatMessage = { role: "assistant", content: "", toolEvents: [] };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    try {
      const resp = await fetch(`/api/meetings/${id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
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
            streamingMsgRef.current += (data.text as string) ?? "";
            const snapshot = streamingMsgRef.current;
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last.role === "assistant") next[next.length - 1] = { ...last, content: snapshot };
              return next;
            });
          } else if (event === "tool_use") {
            const ev: ToolEvent = { name: data.name as string, input: data.input };
            pendingToolRef.current.set(data.name as string, ev);
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last.role === "assistant") {
                next[next.length - 1] = { ...last, toolEvents: [...(last.toolEvents ?? []), ev] };
              }
              return next;
            });
          } else if (event === "tool_result") {
            const pending = pendingToolRef.current.get(data.name as string);
            if (pending) {
              pending.result = data.result ?? data;
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last.role === "assistant" && last.toolEvents) {
                  next[next.length - 1] = {
                    ...last,
                    toolEvents: last.toolEvents.map((e) => e === pending ? { ...e, result: pending.result } : e),
                  };
                }
                return next;
              });
            }
          } else if (event === "error") {
            setChatError(data.error as string ?? "未知错误");
          }
        }
      }
    } catch (e) {
      setChatError(String(e));
    } finally {
      setChatLoading(false);
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
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <Link href="/meetings" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground shrink-0">
          <ChevronLeft className="w-4 h-4" /> 返回历史会议
        </Link>
        <h1 className="text-xl font-semibold flex-1 min-w-0 truncate">{meeting.title}</h1>
        {streaming && (
          <span className="inline-flex items-center gap-1 text-xs text-red-400 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            录音中
          </span>
        )}
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={`/api/meetings/${id}/transcript.md`}
            download
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border border-border/40 hover:bg-muted/40 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> 下载记录
          </a>
          <a
            href={`/api/meetings/${id}/chat.md`}
            download
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded border border-border/40 hover:bg-muted/40 transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> 下载对话
          </a>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-6">
        {utterances.length} 句 · 开始于 {new Date(meeting.startedAt).toLocaleString("zh-CN")}
      </p>

      {/* Two-column layout */}
      <div className="flex gap-6 items-start">
        {/* Left: transcript */}
        <div className="flex-1 min-w-0">
          {utterances.length === 0 ? (
            <p className="text-sm text-muted-foreground">这个会议还没有任何发言。</p>
          ) : (
            <ul className="space-y-2">
              {utterances.map((u) => (
                <li key={u.id} className="rounded-lg border border-border/40 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-[11px] px-2 py-0.5 rounded border ${speakerColor(colorMapRef.current, u.speakerId)}`}>
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

        {/* Right: AI chat panel */}
        <div className="w-[420px] shrink-0 flex flex-col border border-border/40 rounded-lg overflow-hidden bg-card/30">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/40 bg-muted/20">
            <MessageSquare className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-medium">AI 问答</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 max-h-[60vh] min-h-[200px]">
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center mt-8">点击推荐问题或输入内容开始对话</p>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                {msg.role === "user" ? (
                  <div className="max-w-[85%] bg-violet-600/80 text-white text-sm rounded-lg px-3 py-2 leading-relaxed">
                    {msg.content}
                  </div>
                ) : (
                  <div className="max-w-[100%] w-full">
                    {msg.toolEvents && msg.toolEvents.length > 0 && (
                      <div className="mb-2">
                        {msg.toolEvents.map((ev, j) => <ToolCallDisplay key={j} event={ev} />)}
                      </div>
                    )}
                    {msg.content ? (
                      <div className="prose prose-sm prose-invert max-w-none text-sm bg-muted/20 rounded-lg px-3 py-2">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : chatLoading && i === messages.length - 1 ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> 正在思考…
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
            {chatError && (
              <p className="text-xs text-red-400 px-1">{chatError}</p>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Prompt chips */}
          {chipsVisible && (
            <div className="px-3 pt-2 pb-1 border-t border-border/40">
              <div className="flex flex-wrap gap-1.5">
                {PROMPT_CHIPS.map((chip) => (
                  <button
                    key={chip.label}
                    onClick={() => sendMessage(chip.message)}
                    disabled={chatLoading}
                    className="text-[11px] px-2 py-1 rounded-full border border-violet-500/40 text-violet-300 hover:bg-violet-500/10 transition-colors disabled:opacity-50"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!chipsVisible && (
            <div className="px-3 pt-1.5 border-t border-border/40">
              <button
                onClick={() => setChipsVisible(true)}
                className="text-[11px] text-muted-foreground hover:text-foreground"
              >
                显示推荐问题
              </button>
            </div>
          )}

          {/* Input */}
          <div className="flex items-end gap-2 p-3 border-t border-border/40">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                  setInput("");
                }
              }}
              placeholder="输入问题…（Enter 发送，Shift+Enter 换行）"
              rows={2}
              className="flex-1 px-3 py-2 text-sm rounded-md border border-border/40 bg-background focus:outline-none focus:ring-1 focus:ring-violet-500/50 resize-none"
            />
            <button
              onClick={() => { sendMessage(input); setInput(""); }}
              disabled={chatLoading || !input.trim()}
              className="flex items-center gap-1 text-xs px-3 py-2 rounded-md bg-violet-600/80 hover:bg-violet-600 text-white disabled:opacity-50 transition-colors shrink-0"
            >
              {chatLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
