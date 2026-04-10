import { NextRequest } from "next/server";

const SEARXNG_URL = "http://localhost:8888";

export async function POST(req: NextRequest) {
  const { query, count = 5 } = await req.json();

  if (!query || typeof query !== "string") {
    return Response.json({ error: "query is required" }, { status: 400 });
  }

  try {
    const url = `${SEARXNG_URL}/search?q=${encodeURIComponent(query)}&format=json&language=zh-CN`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return Response.json({ results: [], error: "搜索服务暂不可用" });
    }

    const data = await res.json();
    const results = (data.results ?? []).slice(0, count).map(
      (item: { title?: string; url?: string; content?: string; score?: number }) => ({
        title: item.title ?? "",
        url: item.url ?? "",
        content: item.content ?? "",
        score: item.score ?? 0,
      })
    );

    return Response.json({ results });
  } catch {
    return Response.json({ results: [], error: "搜索服务暂不可用" });
  }
}
