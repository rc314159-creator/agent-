/**
 * GET /api/speakers/duplicates?threshold=0.85
 *
 * 找出 centroid cosine 相似度 >= threshold 的 speaker 对，
 * 给 UI 一个"可能是同一人，是否合并？"的入口。
 */

import { NextRequest } from "next/server";
import { findDuplicateSpeakers } from "@/lib/match";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const threshold = Number(url.searchParams.get("threshold") ?? "0.85");
  const pairs = findDuplicateSpeakers(threshold);
  return Response.json({ threshold, count: pairs.length, pairs });
}
