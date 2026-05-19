import { getDb, type SpeakerRow } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const rows = getDb()
    .prepare<[], SpeakerRow & { last_seen: number | null }>(
      `SELECT s.*,
              (SELECT MAX(u.created_at) FROM utterances u WHERE u.speaker_id = s.id) AS last_seen
       FROM speakers s
       ORDER BY (CASE WHEN s.sample_count = 0 THEN 1 ELSE 0 END) ASC,
                s.sample_count DESC,
                s.updated_at DESC`,
    )
    .all();
  return Response.json({
    speakers: rows.map((r) => ({
      id: r.id,
      name: r.name,
      sampleCount: r.sample_count,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      lastSeen: r.last_seen,
    })),
  });
}
