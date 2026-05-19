"use client";

import Link from "next/link";

export default function Page() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">会议记录工具 — MVP</h1>
      <p className="text-sm text-muted-foreground max-w-md text-center">
        录音 + 实时字幕 + 可进化声纹库. 当前正在搭建骨架, UI 与端到端流程将在后续轮次接入.
      </p>
      <nav className="flex gap-3 text-sm">
        <Link className="underline" href="/voiceprints">声纹库</Link>
        <Link className="underline" href="/meetings">历史会议</Link>
      </nav>
    </main>
  );
}
