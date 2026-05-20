"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Play, Pause, Edit2, AlertTriangle, Check, Trash2 } from "lucide-react";

interface Utterance {
  id: string;
  text: string;
  audioPath: string | null;
  confidence: number;
  needsReview: boolean;
  createdAt: number;
  meetingId: string;
  meetingTitle: string | null;
}

interface Speaker {
  id: string;
  name: string;
  sampleCount: number;
}

interface OtherSpeaker {
  id: string;
  name: string;
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function confidencePct(c: number): string {
  return `${Math.round(c * 100)}%`;
}

export default function SpeakerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [speaker, setSpeaker] = useState<Speaker | null>(null);
  const [utterances, setUtterances] = useState<Utterance[]>([]);
  const [others, setOthers] = useState<OtherSpeaker[]>([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    if (!speaker) return;
    const hasUtts = utterances.length > 0;
    const confirmMsg = hasUtts
      ? `确认删除角色「${speaker.name}」？\n该角色下还有 ${utterances.length} 条发言，将一同删除（音频文件也会删除）。\n此操作不可撤销。`
      : `确认删除角色「${speaker.name}」？\n此操作不可撤销。`;
    if (!window.confirm(confirmMsg)) return;
    setDeleting(true);
    try {
      const url = hasUtts ? `/api/speakers/${speaker.id}?cascade=1` : `/api/speakers/${speaker.id}`;
      const res = await fetch(url, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        alert(`删除失败：${data.error ?? res.statusText}`);
        setDeleting(false);
        return;
      }
      router.push("/voiceprints");
    } catch (e) {
      alert(`删除异常：${e instanceof Error ? e.message : String(e)}`);
      setDeleting(false);
    }
  }, [speaker, utterances.length, router]);

  const load = useCallback(async () => {
    const [s, all] = await Promise.all([
      fetch(`/api/speakers/${id}`).then((r) => r.json()),
      fetch("/api/speakers").then((r) => r.json()),
    ]);
    if (s.speaker) {
      setSpeaker(s.speaker);
      setUtterances(s.utterances ?? []);
      setDraft(s.speaker.name);
    }
    setOthers(
      (all.speakers ?? [])
        .filter((x: OtherSpeaker) => x.id !== id)
        .map((x: OtherSpeaker) => ({ id: x.id, name: x.name })),
    );
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const saveName = useCallback(async () => {
    if (!draft.trim() || !speaker || draft === speaker.name) {
      setEditing(false);
      return;
    }
    await fetch(`/api/speakers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: draft.trim() }),
    });
    setEditing(false);
    load();
  }, [draft, id, load, speaker]);

  const moveUtterance = useCallback(
    async (utteranceId: string, targetSpeakerId: string) => {
      await fetch(`/api/utterances/${utteranceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speakerId: targetSpeakerId }),
      });
      load();
    },
    [load],
  );

  const confirm = useCallback(
    async (utteranceId: string) => {
      await fetch(`/api/utterances/${utteranceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      load();
    },
    [load],
  );

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

  if (!speaker) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <p className="text-sm text-muted-foreground">加载中…</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <Link
        href="/voiceprints"
        className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground mb-3"
      >
        <ChevronLeft className="w-4 h-4" /> 返回声纹库
      </Link>

      <div className="flex items-center gap-3 mb-6">
        {editing ? (
          <>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") setEditing(false);
              }}
              className="text-2xl font-semibold bg-transparent border-b border-violet-500 outline-none px-1"
            />
            <button onClick={saveName} className="text-xs text-violet-300 hover:underline">
              保存
            </button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">{speaker.name}</h1>
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <Edit2 className="w-3 h-3" /> 改名
            </button>
          </>
        )}
        <span className="text-xs text-muted-foreground ml-auto">{speaker.sampleCount} 段样本</span>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-500/10 text-red-300 hover:bg-red-500/20 border border-red-500/30 disabled:opacity-50"
          title={utterances.length > 0 ? `删除角色（连同 ${utterances.length} 条发言）` : "删除角色"}
        >
          <Trash2 className="w-3 h-3" /> {deleting ? "删除中…" : "删除"}
        </button>
      </div>

      {utterances.length === 0 ? (
        <p className="text-sm text-muted-foreground">这个声纹还没有发言记录。</p>
      ) : (
        <ul className="space-y-2">
          {utterances.map((u) => (
            <li
              key={u.id}
              className={`rounded-lg border p-3 ${
                u.needsReview ? "border-amber-500/40 bg-amber-500/5" : "border-border/40"
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                {u.needsReview && (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                )}
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(u.createdAt)}
                  {u.meetingTitle ? ` · ${u.meetingTitle}` : ""}
                </span>
                <span className="text-xs text-muted-foreground ml-auto">
                  匹配 {confidencePct(u.confidence)}
                </span>
              </div>
              <p className="text-sm leading-relaxed mb-2">{u.text || <i className="text-muted-foreground">（无文字）</i>}</p>
              <div className="flex items-center gap-2 flex-wrap">
                {u.audioPath && (
                  <button
                    onClick={() => togglePlay(u.id, u.audioPath!)}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-muted/60 hover:bg-muted"
                  >
                    {playing === u.id ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    播放
                  </button>
                )}
                {u.needsReview && (
                  <button
                    onClick={() => confirm(u.id)}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                  >
                    <Check className="w-3 h-3" /> 确认
                  </button>
                )}
                {others.length > 0 && (
                  <select
                    className="text-xs px-2 py-1 rounded bg-muted/60 border border-border/40 outline-none"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) moveUtterance(u.id, e.target.value);
                    }}
                  >
                    <option value="">移到…</option>
                    {others.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
