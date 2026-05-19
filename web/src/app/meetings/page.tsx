"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { History, ChevronRight } from "lucide-react";

interface MeetingItem {
  id: string;
  title: string | null;
  startedAt: number;
  endedAt: number | null;
  utteranceCount: number;
  speakerCount: number;
}

function formatDuration(startedAt: number, endedAt: number | null): string {
  const end = endedAt ?? Date.now();
  const sec = Math.max(0, Math.floor((end - startedAt) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m${s ? ` ${s}s` : ""}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function MeetingsListPage() {
  const [items, setItems] = useState<MeetingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/meetings")
      .then((r) => r.json())
      .then((d) => setItems(d.meetings ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center gap-2 mb-4">
        <History className="w-5 h-5 text-violet-400" />
        <h1 className="text-lg font-semibold">历史会议</h1>
        <span className="text-xs text-muted-foreground">({items.length})</span>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          还没有任何会议记录。先到 <Link href="/" className="underline">录音页</Link> 开始录一段吧。
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((m) => (
            <li key={m.id}>
              <Link
                href={`/meetings/${m.id}`}
                className="flex items-center justify-between p-3 rounded-lg border border-border/40 hover:bg-muted/40 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">
                    {m.title ?? formatDate(m.startedAt)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(m.startedAt)} · {formatDuration(m.startedAt, m.endedAt)} · {m.speakerCount} 人 · {m.utteranceCount} 句
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
