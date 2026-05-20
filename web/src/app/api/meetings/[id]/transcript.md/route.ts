import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

function msToHms(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();

  const meeting = db.prepare("SELECT * FROM meetings WHERE id = ?").get(id) as {
    id: string; title: string | null; started_at: number; ended_at: number | null;
  } | undefined;

  if (!meeting) {
    return new Response("Not Found", { status: 404 });
  }

  const utts = db.prepare(`
    SELECT u.text, u.start_ms, u.end_ms, s.name AS speaker_name
    FROM utterances u
    LEFT JOIN speakers s ON s.id = u.speaker_id
    WHERE u.meeting_id = ?
    ORDER BY u.start_ms ASC
  `).all(id) as Array<{ text: string; start_ms: number; end_ms: number; speaker_name: string | null }>;

  const title = meeting.title ?? id;
  const startDate = new Date(meeting.started_at).toLocaleString("zh-CN");
  const endDate = meeting.ended_at ? new Date(meeting.ended_at).toLocaleString("zh-CN") : "进行中";
  const speakers = [...new Set(utts.map((u) => u.speaker_name ?? "未知"))].join("、");

  const lines = [
    `# 会议记录 — ${title}`,
    "",
    `**开始时间：** ${startDate}`,
    `**结束时间：** ${endDate}`,
    `**参与者：** ${speakers || "（无）"}`,
    "",
    "---",
    "",
    ...utts.map((u) => `[${u.speaker_name ?? "未知"} ${msToHms(u.start_ms)}] ${u.text}`),
  ];

  const content = lines.join("\n");
  const filename = encodeURIComponent(`会议记录-${title}.md`);

  return new Response(content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
