"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Users, ChevronRight, GitMerge, X } from "lucide-react";

interface SpeakerItem {
  id: string;
  name: string;
  sampleCount: number;
  createdAt: number;
  updatedAt: number;
  lastSeen: number | null;
}

interface DupPair {
  aId: string; aName: string;
  bId: string; bName: string;
  similarity: number;
}

function formatDate(ts: number | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? `今天 ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`
    : `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function VoiceprintsListPage() {
  const [items, setItems] = useState<SpeakerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dups, setDups] = useState<DupPair[]>([]);
  const [merging, setMerging] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [speakersRes, dupsRes] = await Promise.all([
        fetch("/api/speakers").then((r) => r.json()),
        fetch("/api/speakers/duplicates?threshold=0.85").then((r) => r.json()),
      ]);
      setItems(speakersRes.speakers ?? []);
      setDups(dupsRes.pairs ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const mergeInto = useCallback(async (sourceId: string, targetId: string) => {
    setMerging(sourceId);
    try {
      const res = await fetch(`/api/speakers/${sourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mergeIntoId: targetId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`合并失败：${data.error ?? res.statusText}`);
      } else {
        await loadAll();
      }
    } finally {
      setMerging(null);
    }
  }, [loadAll]);

  const dismissDup = useCallback((aId: string, bId: string) => {
    setDups((prev) => prev.filter((p) => !(p.aId === aId && p.bId === bId)));
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-5 h-5 text-violet-400" />
        <h1 className="text-lg font-semibold">声纹库</h1>
        <span className="text-xs text-muted-foreground ml-1">({items.length})</span>
      </div>

      {/* Duplicate suggestion banner: 算法发现可能重复的 speaker，提示用户合并 */}
      {dups.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs text-amber-300">
            <GitMerge className="w-3.5 h-3.5" />
            <span className="font-medium">检测到 {dups.length} 对可能重复的角色（centroid 相似度 ≥ 0.85）</span>
          </div>
          <ul className="space-y-1.5">
            {dups.map((p) => (
              <li key={`${p.aId}-${p.bId}`} className="flex items-center gap-2 text-xs">
                <span className="text-foreground">「{p.aName}」</span>
                <span className="text-muted-foreground">↔</span>
                <span className="text-foreground">「{p.bName}」</span>
                <span className="text-amber-300 ml-1">相似 {Math.round(p.similarity * 100)}%</span>
                <div className="flex-1" />
                <button
                  onClick={() => mergeInto(p.aId, p.bId)}
                  disabled={merging === p.aId}
                  className="text-[11px] px-2 py-0.5 rounded bg-violet-600/70 hover:bg-violet-500 text-white disabled:opacity-50"
                  title={`把「${p.aName}」并入「${p.bName}」`}
                >
                  {merging === p.aId ? "合并中…" : `→ 合并到「${p.bName}」`}
                </button>
                <button
                  onClick={() => dismissDup(p.aId, p.bId)}
                  className="text-[11px] p-0.5 rounded hover:bg-muted/40 text-muted-foreground"
                  title="不是同一人，忽略"
                >
                  <X className="w-3 h-3" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          还没有任何声纹。先到 <Link href="/" className="underline">录音页</Link> 录一段会议吧。
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((s) => (
            <li key={s.id}>
              <Link
                href={`/voiceprints/${s.id}`}
                className="flex items-center justify-between p-3 rounded-lg border border-border/40 hover:bg-muted/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{s.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.sampleCount} 段样本 · 最近 {formatDate(s.lastSeen)}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
