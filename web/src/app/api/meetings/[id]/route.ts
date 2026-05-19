import { NextRequest } from "next/server";
import { getDb, now, type MeetingRow, type UtteranceRow } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();
  const meeting = db
    .prepare<[string], MeetingRow>("SELECT * FROM meetings WHERE id = ?")
    .get(id);
  if (!meeting) return Response.json({ error: "not found" }, { status: 404 });

  const utts = db
    .prepare<[string], UtteranceRow & { speaker_name: string | null }>(
      `SELECT u.*, s.name AS speaker_name
       FROM utterances u
       LEFT JOIN speakers s ON s.id = u.speaker_id
       WHERE u.meeting_id = ?
       ORDER BY u.start_ms ASC, u.created_at ASC`,
    )
    .all(id);

  return Response.json({
    meeting: {
      id: meeting.id,
      title: meeting.title,
      startedAt: meeting.started_at,
      endedAt: meeting.ended_at,
    },
    utterances: utts.map((u) => ({
      id: u.id,
      text: u.text,
      startMs: u.start_ms,
      endMs: u.end_ms,
      speakerId: u.speaker_id,
      speakerName: u.speaker_name ?? "未知",
      confidence: u.confidence,
      needsReview: !!u.needs_review,
      audioPath: u.audio_path,
      createdAt: u.created_at,
    })),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json()) as { title?: string; end?: boolean };
  const db = getDb();
  if (body.title !== undefined) {
    db.prepare("UPDATE meetings SET title = ? WHERE id = ?").run(body.title, id);
  }
  if (body.end) {
    db.prepare("UPDATE meetings SET ended_at = ? WHERE id = ?").run(now(), id);
  }
  return Response.json({ ok: true });
}
