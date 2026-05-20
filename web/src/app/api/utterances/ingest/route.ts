/**
 * POST /api/utterances/ingest
 *
 * Body: WAV bytes (Content-Type: audio/wav)
 * Query:
 *   meetingId  (required)  the active meeting id
 *   text       (optional)  the ASR text for this segment, already URL-encoded
 *   startMs    (optional)  segment start time relative to meeting start
 *   endMs      (optional)  segment end time relative to meeting start
 *   autoMode   (optional)  "1" to skip needs_review on medium-confidence matches
 *
 * Flow: save WAV to data/segments/<uuid>.wav → call voiceprint-service /embed
 *   → match against speakers → insert utterance → recompute centroid.
 *
 * Response: { utteranceId, speakerId, speakerName, confidence, needsReview, isNewSpeaker }
 */

import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import {
  embeddingToBlob,
  getDb,
  getSegmentsDir,
  newId,
  now,
} from "@/lib/db";
import { embedAudio } from "@/lib/voiceprint-client";
import { audioQualityGate, matchAndAssign, recomputeCentroid } from "@/lib/match";
import { emitUtterance } from "@/lib/sse-bus";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const meetingId = url.searchParams.get("meetingId");
  const text = url.searchParams.get("text") ?? "";
  const startMs = Number(url.searchParams.get("startMs") ?? "0");
  const endMs = Number(url.searchParams.get("endMs") ?? "0");
  const autoMode = url.searchParams.get("autoMode") === "1";

  if (!meetingId) {
    return Response.json({ error: "meetingId required" }, { status: 400 });
  }

  const wavBytes = Buffer.from(await req.arrayBuffer());
  if (wavBytes.length < 1024) {
    return Response.json({ error: "audio too short" }, { status: 400 });
  }

  // 音频质量门槛：拦住纯静音/纯单频（避免生成假 speaker）。
  // 失败返回 200 + skipped:true，让前端 UI 显示"已跳过"而不是当 error
  const quality = audioQualityGate(wavBytes);
  if (!quality.ok) {
    return Response.json({
      skipped: true,
      reason: quality.reason,
      rms: quality.rms,
      zcr: quality.zcr,
    });
  }

  const utteranceId = newId();
  const filename = `${utteranceId}.wav`;
  const audioPath = path.join(getSegmentsDir(), filename);

  // 1) Persist segment audio FIRST so the user can listen to it even if
  //    embedding fails downstream.
  fs.writeFileSync(audioPath, wavBytes);

  // 2) Extract embedding via the voiceprint service.
  let embedding: Float32Array;
  try {
    embedding = await embedAudio(wavBytes);
  } catch (e) {
    fs.unlinkSync(audioPath);
    return Response.json(
      { error: `embed failed: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }

  // 3) Match against existing speakers (or create new "新用户 N").
  const match = matchAndAssign(embedding, autoMode);

  // 4) Insert the utterance row.
  const db = getDb();
  db.prepare(
    `INSERT INTO utterances
      (id, meeting_id, speaker_id, text, start_ms, end_ms,
       audio_path, raw_embedding, confidence, needs_review, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    utteranceId,
    meetingId,
    match.speakerId,
    text,
    startMs,
    endMs,
    filename,
    embeddingToBlob(embedding),
    match.confidence,
    match.needsReview ? 1 : 0,
    now(),
  );

  // 5) Refresh that speaker's centroid against the full sample set.
  recomputeCentroid(match.speakerId);

  // 6) Broadcast to any SSE subscribers watching this meeting's stream.
  emitUtterance(meetingId, {
    utteranceId,
    speakerId: match.speakerId,
    speakerName: match.speakerName,
    text,
    confidence: match.confidence,
    needsReview: match.needsReview,
    startMs,
    endMs,
  });

  return Response.json({
    utteranceId,
    speakerId: match.speakerId,
    speakerName: match.speakerName,
    confidence: match.confidence,
    needsReview: match.needsReview,
    isNewSpeaker: match.isNew,
  });
}
