/**
 * Voiceprint matching + centroid maintenance.
 *
 * Tiered thresholds (cosine similarity on L2-normalized embeddings):
 *   >= 0.75   high confidence, auto-assign
 *   0.60~0.75 medium, assign but flag needs_review (unless autoMode is on)
 *   <  0.60   low,  create a new speaker "新用户 N"
 *
 * Centroid update is "recompute from all utterances" (not incremental EMA)
 * to make user corrections idempotent: moving an utterance from A->B
 * requires recomputing both centroids from the latest set of raw_embeddings.
 */

import {
  blobToEmbedding,
  embeddingToBlob,
  getDb,
  newId,
  now,
  type SpeakerRow,
  type UtteranceRow,
} from "./db";

export interface MatchResult {
  speakerId: string;
  speakerName: string;
  confidence: number;
  needsReview: boolean;
  isNew: boolean;
}

export const HIGH_THRESHOLD = 0.75;
export const LOW_THRESHOLD = 0.6;

function cosine(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

/**
 * Match a new embedding against existing speaker centroids.
 * Creates and inserts a "新用户 N" row if no match passes the LOW threshold.
 * Does NOT touch the centroid — caller must invoke recomputeCentroid()
 * after the utterance is inserted.
 */
export function matchAndAssign(embedding: Float32Array, autoMode: boolean): MatchResult {
  const db = getDb();
  const rows = db
    .prepare<[], SpeakerRow>(
      "SELECT id, name, sample_count, centroid, created_at, updated_at FROM speakers",
    )
    .all();

  let best: { row: SpeakerRow; score: number } | null = null;
  for (const r of rows) {
    const c = blobToEmbedding(r.centroid);
    if (!c) continue;
    const s = cosine(embedding, c);
    if (!best || s > best.score) best = { row: r, score: s };
  }

  const score = best?.score ?? 0;

  if (best && score >= HIGH_THRESHOLD) {
    return {
      speakerId: best.row.id,
      speakerName: best.row.name,
      confidence: score,
      needsReview: false,
      isNew: false,
    };
  }
  if (best && score >= LOW_THRESHOLD) {
    return {
      speakerId: best.row.id,
      speakerName: best.row.name,
      confidence: score,
      needsReview: !autoMode,
      isNew: false,
    };
  }
  // low: create a new speaker
  const id = newId();
  const countRow = db.prepare("SELECT COUNT(*) AS c FROM speakers").get() as { c: number };
  const name = `新用户 ${countRow.c + 1}`;
  const ts = now();
  db.prepare(
    "INSERT INTO speakers (id, name, sample_count, centroid, created_at, updated_at) VALUES (?, ?, 0, NULL, ?, ?)",
  ).run(id, name, ts, ts);
  return { speakerId: id, speakerName: name, confidence: score, needsReview: false, isNew: true };
}

/**
 * Recompute centroid for a speaker = mean(all utterance raw_embeddings) + L2 normalize.
 * Idempotent. Safe to call after every write/move.
 */
export function recomputeCentroid(speakerId: string): void {
  const db = getDb();
  const rows = db
    .prepare<[string], Pick<UtteranceRow, "raw_embedding">>(
      "SELECT raw_embedding FROM utterances WHERE speaker_id = ?",
    )
    .all(speakerId);
  let sum: Float32Array | null = null;
  let count = 0;
  for (const r of rows) {
    const e = blobToEmbedding(r.raw_embedding);
    if (!e) continue;
    if (!sum) sum = new Float32Array(e.length);
    if (sum.length !== e.length) continue; // dimension mismatch, skip
    for (let i = 0; i < e.length; i++) sum[i] += e[i];
    count++;
  }
  const ts = now();
  if (count === 0 || !sum) {
    db.prepare(
      "UPDATE speakers SET sample_count = 0, centroid = NULL, updated_at = ? WHERE id = ?",
    ).run(ts, speakerId);
    return;
  }
  let mag = 0;
  for (let i = 0; i < sum.length; i++) {
    sum[i] /= count;
    mag += sum[i] * sum[i];
  }
  mag = Math.sqrt(mag);
  if (mag > 0) for (let i = 0; i < sum.length; i++) sum[i] /= mag;
  db.prepare(
    "UPDATE speakers SET sample_count = ?, centroid = ?, updated_at = ? WHERE id = ?",
  ).run(count, embeddingToBlob(sum), ts, speakerId);
}
