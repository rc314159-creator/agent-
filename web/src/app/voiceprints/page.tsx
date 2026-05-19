"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, ChevronRight } from "lucide-react";

interface SpeakerItem {
  id: string;
  name: string;
  sampleCount: number;
  createdAt: number;
  updatedAt: number;
  lastSeen: number | null;
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

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/speakers");
        const data = await res.json();
        if (!cancelled) setItems(data.speakers ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-5 h-5 text-violet-400" />
        <h1 className="text-lg font-semibold">声纹库</h1>
        <span className="text-xs text-muted-foreground ml-1">({items.length})</span>
      </div>
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
