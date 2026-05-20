/**
 * Voiceprint matching + centroid maintenance — R13 升级版
 *
 * 在 R7 三档阈值之上叠加：
 * 1. **置信度加权 centroid**：高置信度 utterance 在 centroid 里权重更大，防止低质 embedding 毒化平均
 * 2. **指数时间衰减**：30 天半衰期，让 centroid 跟得上用户声音/麦克风的缓慢漂移
 * 3. **margin 决策**：top1 与 top2 差距 < 0.05 → 即便分数过高阈值也 needs_review，避免相邻 speaker 误归
 * 4. **每个 speaker 维护 sample variance**：utterance 与该 speaker 的距离超过历史方差 2σ 即 outlier flag
 * 5. **保持 idempotent**：recomputeCentroid 仍然是「从全部 utterance 重算」，用户每次 move 都安全
 *
 * Tiered thresholds (cosine similarity on L2-normalized embeddings):
 *   >= 0.75 + margin>=0.05  high confidence, auto-assign
 *   >= 0.75 但 margin<0.05  ambiguous, needs_review
 *   0.60 ~ 0.75            medium, needs_review unless autoMode
 *   < 0.60                 low, create new speaker
 *
 * Centroid 更新仍是「从全部 utterance 重算 + 权重」，保持移动操作 idempotent。
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
  /** 与 top2 speaker 的 cosine 差距，<0.05 即视为 ambiguous */
  marginToSecond: number;
  /** 该 embedding 偏离 top1 历史 σ 几倍，>2 即 outlier */
  outlierZ: number;
}

// ---- 可调参数（写在一起便于后续 tuning） ----------------------------------
export const HIGH_THRESHOLD = 0.75;
export const LOW_THRESHOLD = 0.6;
/** top1 与 top2 cosine 差距 < 此值，标 needs_review */
export const MARGIN_THRESHOLD = 0.05;
/** 距离 top1 历史均值超过几个 σ 即视为 outlier */
export const OUTLIER_SIGMA = 2.0;
/** centroid 时间衰减半衰期 (天) — 30 天前的样本权重打 0.5 */
export const TIME_HALF_LIFE_DAYS = 30;
/** 置信度对权重的影响范围（防止过分放大或抑制） */
const MIN_CONF_WEIGHT = 0.3;
const MAX_CONF_WEIGHT = 1.0;
// ---------------------------------------------------------------------------

/**
 * 检查一段 WAV 是否值得做声纹推理。
 * 拦住纯静音 / 纯单频音 / 异常短小，避免它们生成假声纹。
 *
 * 返回 ok=false 时调用方应拒绝 ingest，不能创建新 speaker。
 */
export function audioQualityGate(wav: Buffer): { ok: boolean; rms: number; zcr: number; reason?: string } {
  // 标准 WAV：44 字节 RIFF header + 16-bit PCM 样本。
  // 如果 header 大小异常或样本不够，直接拒绝。
  if (wav.length < 44 + 16_000) {
    // 16kHz * 16bit * 0.5s = 16000 字节，至少要 0.5 秒
    return { ok: false, rms: 0, zcr: 0, reason: "片段太短 (< 0.5s)" };
  }
  const sampleCount = (wav.length - 44) / 2;
  // 用 DataView 安全读 16-bit signed little-endian
  const dv = new DataView(wav.buffer, wav.byteOffset + 44, wav.length - 44);
  let sumSq = 0;
  let zeroCrossings = 0;
  let prevSample = 0;
  for (let i = 0; i < sampleCount; i++) {
    const s = dv.getInt16(i * 2, true);
    sumSq += s * s;
    if (i > 0 && ((s >= 0) !== (prevSample >= 0))) zeroCrossings++;
    prevSample = s;
  }
  const rms = Math.sqrt(sumSq / sampleCount);
  const zcr = zeroCrossings / sampleCount;

  // 经验阈值（int16 范围 -32768~32767）
  if (rms < 100) {
    return { ok: false, rms, zcr, reason: `近乎静音 (RMS=${rms.toFixed(0)} < 100)` };
  }
  // 真人语音 ZCR 在 0.02~0.4 之间，按句子统计有方差。
  // 纯 sin 波 ZCR 几乎固定（440Hz @ 16kHz ≈ 0.055），用 ZCR 极端值粗判。
  if (zcr < 0.005 || zcr > 0.6) {
    return { ok: false, rms, zcr, reason: `ZCR 异常 (${zcr.toFixed(3)})，可能是非人声` };
  }
  return { ok: true, rms, zcr };
}

function cosine(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

/**
 * 计算一条 utterance 在 centroid 计算中的权重。
 *   weight = clamp(confidence, MIN..MAX) * 2^(-age_days / HALF_LIFE)
 */
function utteranceWeight(confidence: number, createdAtMs: number, nowMs: number): number {
  const conf = Math.max(MIN_CONF_WEIGHT, Math.min(MAX_CONF_WEIGHT, confidence || MIN_CONF_WEIGHT));
  const ageDays = Math.max(0, (nowMs - createdAtMs) / 86_400_000);
  const decay = Math.pow(0.5, ageDays / TIME_HALF_LIFE_DAYS);
  return conf * decay;
}

/**
 * 计算 speaker 历史样本到自身 centroid 的余弦距离均值和标准差。
 * 用于 outlier 判定。
 */
function speakerSelfStats(speakerId: string, centroid: Float32Array): { mean: number; std: number; n: number } {
  const db = getDb();
  const rows = db
    .prepare<[string], Pick<UtteranceRow, "raw_embedding">>(
      "SELECT raw_embedding FROM utterances WHERE speaker_id = ?",
    )
    .all(speakerId);
  const sims: number[] = [];
  for (const r of rows) {
    const e = blobToEmbedding(r.raw_embedding);
    if (!e || e.length !== centroid.length) continue;
    sims.push(cosine(e, centroid));
  }
  if (sims.length < 2) return { mean: 1, std: 0.1, n: sims.length };
  let mean = 0;
  for (const s of sims) mean += s;
  mean /= sims.length;
  let varAcc = 0;
  for (const s of sims) varAcc += (s - mean) * (s - mean);
  const std = Math.max(0.01, Math.sqrt(varAcc / sims.length));
  return { mean, std, n: sims.length };
}

/**
 * 匹配 + 归属。返回 top1，附带 margin / outlier 诊断字段。
 * 不更新 centroid，由 caller 在 INSERT 后调用 recomputeCentroid()。
 */
export function matchAndAssign(embedding: Float32Array, autoMode: boolean): MatchResult {
  const db = getDb();
  const rows = db
    .prepare<[], SpeakerRow>(
      "SELECT id, name, sample_count, centroid, created_at, updated_at FROM speakers",
    )
    .all();

  // 算所有 speaker 的 cosine
  const scored: Array<{ row: SpeakerRow; score: number; centroid: Float32Array }> = [];
  for (const r of rows) {
    const c = blobToEmbedding(r.centroid);
    if (!c) continue;
    scored.push({ row: r, score: cosine(embedding, c), centroid: c });
  }
  scored.sort((a, b) => b.score - a.score);

  const top1 = scored[0] ?? null;
  const top2 = scored[1] ?? null;
  const margin = top1 ? top1.score - (top2?.score ?? 0) : 0;

  // 算 outlier z-score（top1 历史样本到 centroid 的均值/标准差，新样本偏离几倍 σ）
  let outlierZ = 0;
  if (top1) {
    const stats = speakerSelfStats(top1.row.id, top1.centroid);
    if (stats.n >= 2) outlierZ = (stats.mean - top1.score) / stats.std;
  }
  const isOutlier = outlierZ > OUTLIER_SIGMA;

  // High 档：分数足够 + margin 足够 + 不是 outlier
  if (top1 && top1.score >= HIGH_THRESHOLD && margin >= MARGIN_THRESHOLD && !isOutlier) {
    return {
      speakerId: top1.row.id,
      speakerName: top1.row.name,
      confidence: top1.score,
      needsReview: false,
      isNew: false,
      marginToSecond: margin,
      outlierZ,
    };
  }
  // High 但 ambiguous（margin 小）或 outlier → 仍归 top1 但标 needs_review
  if (top1 && top1.score >= HIGH_THRESHOLD) {
    return {
      speakerId: top1.row.id,
      speakerName: top1.row.name,
      confidence: top1.score,
      needsReview: !autoMode,
      isNew: false,
      marginToSecond: margin,
      outlierZ,
    };
  }
  // Medium 档
  if (top1 && top1.score >= LOW_THRESHOLD) {
    return {
      speakerId: top1.row.id,
      speakerName: top1.row.name,
      confidence: top1.score,
      needsReview: !autoMode,
      isNew: false,
      marginToSecond: margin,
      outlierZ,
    };
  }
  // Low 档 → 新 speaker
  const id = newId();
  const countRow = db.prepare("SELECT COUNT(*) AS c FROM speakers").get() as { c: number };
  const name = `新用户 ${countRow.c + 1}`;
  const ts = now();
  db.prepare(
    "INSERT INTO speakers (id, name, sample_count, centroid, created_at, updated_at) VALUES (?, ?, 0, NULL, ?, ?)",
  ).run(id, name, ts, ts);
  return {
    speakerId: id,
    speakerName: name,
    confidence: top1?.score ?? 0,
    needsReview: false,
    isNew: true,
    marginToSecond: margin,
    outlierZ,
  };
}

/**
 * Recompute centroid for a speaker = weighted_mean(utterance_embeddings).
 * 权重 = clamp(confidence) * 2^(-age_days/HALF_LIFE)，最后 L2 normalize。
 * Idempotent：每次 INSERT / move 后都安全调用。
 */
export function recomputeCentroid(speakerId: string): void {
  const db = getDb();
  const rows = db
    .prepare<[string], Pick<UtteranceRow, "raw_embedding" | "confidence" | "created_at">>(
      "SELECT raw_embedding, confidence, created_at FROM utterances WHERE speaker_id = ?",
    )
    .all(speakerId);
  let sum: Float32Array | null = null;
  let totalWeight = 0;
  let sampleCount = 0;
  const nowMs = Date.now();
  for (const r of rows) {
    const e = blobToEmbedding(r.raw_embedding);
    if (!e) continue;
    if (!sum) sum = new Float32Array(e.length);
    if (sum.length !== e.length) continue;
    const w = utteranceWeight(r.confidence, r.created_at, nowMs);
    for (let i = 0; i < e.length; i++) sum[i] += e[i] * w;
    totalWeight += w;
    sampleCount++;
  }
  const ts = now();
  if (sampleCount === 0 || !sum || totalWeight === 0) {
    db.prepare(
      "UPDATE speakers SET sample_count = 0, centroid = NULL, updated_at = ? WHERE id = ?",
    ).run(ts, speakerId);
    return;
  }
  let mag = 0;
  for (let i = 0; i < sum.length; i++) {
    sum[i] /= totalWeight;
    mag += sum[i] * sum[i];
  }
  mag = Math.sqrt(mag);
  if (mag > 0) for (let i = 0; i < sum.length; i++) sum[i] /= mag;
  db.prepare(
    "UPDATE speakers SET sample_count = ?, centroid = ?, updated_at = ? WHERE id = ?",
  ).run(sampleCount, embeddingToBlob(sum), ts, speakerId);
}

/**
 * 找出所有"可能重复"的 speaker pair（centroid cosine ≥ threshold）。
 * 给 UI 显示 merge 建议。
 */
export function findDuplicateSpeakers(threshold = 0.85): Array<{
  aId: string; aName: string; bId: string; bName: string; similarity: number;
}> {
  const db = getDb();
  const rows = db
    .prepare<[], SpeakerRow>("SELECT id, name, sample_count, centroid, created_at, updated_at FROM speakers WHERE centroid IS NOT NULL")
    .all();
  const speakers = rows
    .map((r) => ({ id: r.id, name: r.name, centroid: blobToEmbedding(r.centroid) }))
    .filter((s): s is { id: string; name: string; centroid: Float32Array } => s.centroid !== null);

  const pairs: Array<{ aId: string; aName: string; bId: string; bName: string; similarity: number }> = [];
  for (let i = 0; i < speakers.length; i++) {
    for (let j = i + 1; j < speakers.length; j++) {
      const sim = cosine(speakers[i].centroid, speakers[j].centroid);
      if (sim >= threshold) {
        pairs.push({
          aId: speakers[i].id,
          aName: speakers[i].name,
          bId: speakers[j].id,
          bName: speakers[j].name,
          similarity: sim,
        });
      }
    }
  }
  pairs.sort((a, b) => b.similarity - a.similarity);
  return pairs;
}
