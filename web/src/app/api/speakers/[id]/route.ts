import { NextRequest } from "next/server";
import { getDb, now, type SpeakerRow, type UtteranceRow } from "@/lib/db";
import { recomputeCentroid } from "@/lib/match";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();
  const speaker = db
    .prepare<[string], SpeakerRow>("SELECT * FROM speakers WHERE id = ?")
    .get(id);
  if (!speaker) return Response.json({ error: "not found" }, { status: 404 });

  const utts = db
    .prepare<[string], UtteranceRow & { meeting_title: string | null }>(
      `SELECT u.*, m.title AS meeting_title
       FROM utterances u
       LEFT JOIN meetings m ON m.id = u.meeting_id
       WHERE u.speaker_id = ?
       ORDER BY u.created_at DESC`,
    )
    .all(id);

  return Response.json({
    speaker: {
      id: speaker.id,
      name: speaker.name,
      sampleCount: speaker.sample_count,
      createdAt: speaker.created_at,
      updatedAt: speaker.updated_at,
    },
    utterances: utts.map((u) => ({
      id: u.id,
      text: u.text,
      audioPath: u.audio_path,
      confidence: u.confidence,
      needsReview: !!u.needs_review,
      createdAt: u.created_at,
      meetingId: u.meeting_id,
      meetingTitle: u.meeting_title,
    })),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json()) as { name?: string; mergeIntoId?: string };
  const db = getDb();

  // Merge: move all utterances from this speaker into the target, then delete this one
  if (body.mergeIntoId) {
    const target = db.prepare("SELECT 1 FROM speakers WHERE id = ?").get(body.mergeIntoId);
    if (!target) return Response.json({ error: "target not found" }, { status: 404 });
    if (body.mergeIntoId === id) {
      return Response.json({ error: "cannot merge into self" }, { status: 400 });
    }
    db.prepare("UPDATE utterances SET speaker_id = ? WHERE speaker_id = ?").run(body.mergeIntoId, id);
    db.prepare("DELETE FROM speakers WHERE id = ?").run(id);
    recomputeCentroid(body.mergeIntoId);
    return Response.json({ ok: true, mergedInto: body.mergeIntoId });
  }

  if (body.name) {
    db.prepare("UPDATE speakers SET name = ?, updated_at = ? WHERE id = ?").run(
      body.name,
      now(),
      id,
    );
    return Response.json({ ok: true });
  }

  return Response.json({ error: "no-op" }, { status: 400 });
}
