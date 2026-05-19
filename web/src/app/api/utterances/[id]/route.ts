/**
 * PATCH /api/utterances/:id
 *
 * Move an utterance to a different speaker, or confirm a "needs_review" item.
 *   body: { speakerId: string }     → move + recompute both centroids
 *   body: { confirm: true }         → clear needs_review flag
 *   body: { text: string }          → edit transcript (no embedding change)
 */

import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { recomputeCentroid } from "@/lib/match";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json()) as {
    speakerId?: string;
    confirm?: boolean;
    text?: string;
  };
  const db = getDb();

  if (body.speakerId) {
    const ut = db
      .prepare<[string], { speaker_id: string }>(
        "SELECT speaker_id FROM utterances WHERE id = ?",
      )
      .get(id);
    if (!ut) return Response.json({ error: "utterance not found" }, { status: 404 });
    const fromSpeaker = ut.speaker_id;
    const toSpeaker = body.speakerId;
    if (!db.prepare("SELECT 1 FROM speakers WHERE id = ?").get(toSpeaker)) {
      return Response.json({ error: "target speaker not found" }, { status: 404 });
    }
    db.prepare(
      "UPDATE utterances SET speaker_id = ?, needs_review = 0 WHERE id = ?",
    ).run(toSpeaker, id);
    recomputeCentroid(fromSpeaker);
    if (fromSpeaker !== toSpeaker) recomputeCentroid(toSpeaker);
    return Response.json({ ok: true });
  }

  if (body.confirm) {
    db.prepare("UPDATE utterances SET needs_review = 0 WHERE id = ?").run(id);
    return Response.json({ ok: true });
  }

  if (body.text !== undefined) {
    db.prepare("UPDATE utterances SET text = ? WHERE id = ?").run(body.text, id);
    return Response.json({ ok: true });
  }

  return Response.json({ error: "no-op" }, { status: 400 });
}
