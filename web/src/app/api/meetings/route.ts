import { NextRequest } from "next/server";
import { getDb, newId, now, type MeetingRow } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as { title?: string }));
  const id = newId();
  const title = body.title ?? `会议 ${new Date().toLocaleString("zh-CN", { hour12: false })}`;
  const startedAt = now();
  getDb()
    .prepare(
      "INSERT INTO meetings (id, title, started_at, ended_at) VALUES (?, ?, ?, NULL)",
    )
    .run(id, title, startedAt);
  return Response.json({ id, title, startedAt });
}

export async function GET() {
  const rows = getDb()
    .prepare<[], MeetingRow & { utterance_count: number; speaker_count: number }>(
      `SELECT m.*,
              (SELECT COUNT(*) FROM utterances u WHERE u.meeting_id = m.id) AS utterance_count,
              (SELECT COUNT(DISTINCT u.speaker_id) FROM utterances u WHERE u.meeting_id = m.id) AS speaker_count
       FROM meetings m
       ORDER BY m.started_at DESC`,
    )
    .all();
  return Response.json({
    meetings: rows.map((r) => ({
      id: r.id,
      title: r.title,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      utteranceCount: r.utterance_count,
      speakerCount: r.speaker_count,
    })),
  });
}
