"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { ChevronLeft, AlertTriangle, Play, Pause } from "lucide-react";

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

export default function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [utterances, setUtterances] = useState<UtteranceItem[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch(`/api/meetings/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setMeeting(d.meeting ?? null);
        setUtterances(d.utterances ?? []);
      });
  }, [id]);

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

  if (!meeting) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <p className="text-sm text-muted-foreground">加载中…</p>
      </div>
    );
  }

  const colorMap = new Map<string, number>();

  return (
    <div className="max-w-3xl mx-auto p-6">
      <Link
        href="/meetings"
        className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground mb-3"
      >
        <ChevronLeft className="w-4 h-4" /> 返回历史会议
      </Link>
      <h1 className="text-xl font-semibold mb-1">{meeting.title}</h1>
      <p className="text-xs text-muted-foreground mb-6">
        {utterances.length} 句 · 开始于 {new Date(meeting.startedAt).toLocaleString("zh-CN")}
      </p>

      {utterances.length === 0 ? (
        <p className="text-sm text-muted-foreground">这个会议还没有任何发言。</p>
      ) : (
        <ul className="space-y-2">
          {utterances.map((u) => (
            <li key={u.id} className="rounded-lg border border-border/40 p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className={`text-[11px] px-2 py-0.5 rounded border ${speakerColor(colorMap, u.speakerId)}`}
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
    </div>
  );
}
