import Anthropic from "@anthropic-ai/sdk";
import { getDb, getSetting } from "@/lib/db";
import fs from "node:fs";
import path from "node:path";

export function getAnthropicClient(): Anthropic {
  const apiKey =
    getSetting("anthropic_api_key") ??
    process.env.ANTHROPIC_API_KEY ??
    process.env.YUNWU_API_KEY;
  const rawBase =
    getSetting("anthropic_base_url") ??
    process.env.ANTHROPIC_BASE_URL ??
    (process.env.YUNWU_API_KEY ? process.env.YUNWU_BASE_URL : undefined);
  if (!apiKey) throw new Error("未配置 Anthropic API Key，请前往 /settings 配置");
  // SDK appends /v1/messages internally — strip trailing /v1 if present to avoid doubling
  const baseURL = rawBase ? rawBase.replace(/\/v1\/?$/, "") : undefined;
  return new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
}

export function getModel(): string {
  // Full versioned model IDs required by some proxies (e.g. yunwu); aliases may not resolve
  return getSetting("anthropic_model") ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5-20250929";
}

export function getSystemPrompt(): string {
  return (
    getSetting("agent_system_prompt") ??
    `你是一个专业的会议记录分析助手。你的任务是分析会议记录，生成结构化的会议总结。
总结应包含：
1. 会议概述（时间、参与者、主要议题）
2. 关键讨论点（按话题分组）
3. 决策与结论
4. 待办事项（如有）
5. 跨会议洞察（结合历史会议记录，分析参与者的行为模式和持续关注的话题）

请用中文输出，格式清晰，使用 Markdown。`
  );
}

// ---------- Tool implementations ----------

export function getMeetingTranscript(meetingId: string): object {
  const db = getDb();
  const meeting = db.prepare("SELECT * FROM meetings WHERE id = ?").get(meetingId) as {
    id: string; title: string | null; started_at: number; ended_at: number | null;
  } | undefined;
  if (!meeting) return { error: `会议 ${meetingId} 不存在` };

  const utts = db.prepare(`
    SELECT u.id, u.text, u.start_ms, u.end_ms, u.confidence, u.needs_review,
           s.name AS speaker_name
    FROM utterances u
    LEFT JOIN speakers s ON s.id = u.speaker_id
    WHERE u.meeting_id = ?
    ORDER BY u.start_ms ASC
  `).all(meetingId) as Array<{
    id: string; text: string; start_ms: number; end_ms: number;
    confidence: number; needs_review: number; speaker_name: string | null;
  }>;

  return {
    meeting: {
      id: meeting.id,
      title: meeting.title,
      startedAt: meeting.started_at,
      endedAt: meeting.ended_at,
    },
    utterances: utts.map((u) => ({
      speaker: u.speaker_name ?? "未知",
      text: u.text,
      startMs: u.start_ms,
      endMs: u.end_ms,
      confidence: Math.round(u.confidence * 100),
      needsReview: !!u.needs_review,
    })),
  };
}

export function listSpeakers(): object {
  const rows = getDb().prepare(`
    SELECT s.id, s.name, s.sample_count,
           (SELECT MAX(u.created_at) FROM utterances u WHERE u.speaker_id = s.id) AS last_seen
    FROM speakers s ORDER BY s.sample_count DESC
  `).all() as Array<{ id: string; name: string; sample_count: number; last_seen: number | null }>;
  return { speakers: rows.map((r) => ({ id: r.id, name: r.name, sampleCount: r.sample_count, lastSeen: r.last_seen })) };
}

export function searchSpeakerHistory(speakerId: string, limit = 20): object {
  const db = getDb();
  const speaker = db.prepare("SELECT id, name, sample_count FROM speakers WHERE id = ?").get(speakerId) as {
    id: string; name: string; sample_count: number;
  } | undefined;
  if (!speaker) return { error: `说话人 ${speakerId} 不存在` };

  const rows = db.prepare(`
    SELECT u.text, u.start_ms, u.confidence,
           m.id AS meeting_id, m.title AS meeting_title, m.started_at
    FROM utterances u
    LEFT JOIN meetings m ON m.id = u.meeting_id
    WHERE u.speaker_id = ?
    ORDER BY u.created_at DESC
    LIMIT ?
  `).all(speakerId, limit) as Array<{
    text: string; start_ms: number; confidence: number;
    meeting_id: string; meeting_title: string | null; started_at: number;
  }>;

  return {
    speaker: { id: speaker.id, name: speaker.name, totalUtterances: speaker.sample_count },
    recentUtterances: rows.map((r) => ({
      text: r.text,
      meetingTitle: r.meeting_title,
      meetingId: r.meeting_id,
      startedAt: r.started_at,
    })),
  };
}

export function searchPastMeetings(query: string, limit = 5): object {
  const rows = getDb().prepare(`
    SELECT u.text, u.start_ms,
           s.name AS speaker_name,
           m.id AS meeting_id, m.title AS meeting_title, m.started_at
    FROM utterances u
    LEFT JOIN speakers s ON s.id = u.speaker_id
    LEFT JOIN meetings m ON m.id = u.meeting_id
    WHERE u.text LIKE ?
    ORDER BY m.started_at DESC
    LIMIT ?
  `).all(`%${query}%`, limit) as Array<{
    text: string; start_ms: number; speaker_name: string | null;
    meeting_id: string; meeting_title: string | null; started_at: number;
  }>;

  return {
    query,
    results: rows.map((r) => ({
      text: r.text,
      speaker: r.speaker_name ?? "未知",
      meetingTitle: r.meeting_title,
      meetingId: r.meeting_id,
      startedAt: r.started_at,
    })),
  };
}

// ---------- Tool definitions for Claude ----------

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_meeting_transcript",
    description: "获取指定会议的完整发言记录，包含每句话的说话人、内容和时间戳",
    input_schema: {
      type: "object" as const,
      properties: {
        meeting_id: { type: "string", description: "会议 ID" },
      },
      required: ["meeting_id"],
    },
  },
  {
    name: "list_speakers",
    description: "列出所有已知说话人及其发言次数，用于了解会议参与者",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "search_speaker_history",
    description: "查询某个说话人在历史会议中的所有发言记录",
    input_schema: {
      type: "object" as const,
      properties: {
        speaker_id: { type: "string", description: "说话人 ID" },
        limit: { type: "number", description: "返回条数，默认 20" },
      },
      required: ["speaker_id"],
    },
  },
  {
    name: "search_past_meetings",
    description: "全文搜索历史会议中包含特定关键词的发言",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "搜索关键词" },
        limit: { type: "number", description: "返回条数，默认 5" },
      },
      required: ["query"],
    },
  },
];

// ---------- Tool dispatcher ----------

export function dispatchTool(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "get_meeting_transcript":
      return JSON.stringify(getMeetingTranscript(input.meeting_id as string));
    case "list_speakers":
      return JSON.stringify(listSpeakers());
    case "search_speaker_history":
      return JSON.stringify(searchSpeakerHistory(input.speaker_id as string, (input.limit as number) ?? 20));
    case "search_past_meetings":
      return JSON.stringify(searchPastMeetings(input.query as string, (input.limit as number) ?? 5));
    default:
      return JSON.stringify({ error: `未知工具 ${name}` });
  }
}

// ---------- Memory: save summary to disk ----------

export function saveSummaryMemory(meetingId: string, markdown: string, dataDir: string): void {
  const memDir = path.join(dataDir, "agent-memory");
  fs.mkdirSync(memDir, { recursive: true });
  fs.writeFileSync(path.join(memDir, `meeting_${meetingId}.md`), markdown, "utf-8");
}

export function loadPastSummaries(dataDir: string, limit = 5): string {
  const memDir = path.join(dataDir, "agent-memory");
  if (!fs.existsSync(memDir)) return "";
  const files = fs.readdirSync(memDir).filter((f) => f.endsWith(".md")).slice(-limit);
  return files
    .map((f) => `### ${f}\n${fs.readFileSync(path.join(memDir, f), "utf-8")}`)
    .join("\n\n---\n\n");
}
