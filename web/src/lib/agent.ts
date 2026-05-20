import { query, createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { getDb, getSetting, getDataDir } from "@/lib/db";
import fs from "node:fs";
import path from "node:path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

// ---------- Config helpers ----------

export function getAgentEnv(): Record<string, string | undefined> {
  const apiKey =
    getSetting("anthropic_api_key") ??
    process.env.ANTHROPIC_API_KEY ??
    process.env.YUNWU_API_KEY;
  const rawBase =
    getSetting("anthropic_base_url") ??
    process.env.ANTHROPIC_BASE_URL ??
    (process.env.YUNWU_API_KEY ? process.env.YUNWU_BASE_URL : undefined);
  // SDK spawns claude CLI which appends /v1/messages — strip trailing /v1 to avoid doubling
  const baseURL = rawBase ? rawBase.replace(/\/v1\/?$/, "") : undefined;

  if (!apiKey) throw new Error("未配置 Anthropic API Key，请前往 /settings 配置");

  return {
    ...process.env,
    ANTHROPIC_API_KEY: apiKey,
    ...(baseURL ? { ANTHROPIC_BASE_URL: baseURL } : {}),
  };
}

export function getModel(): string {
  return getSetting("anthropic_model") ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5-20250929";
}

export function getSystemPrompt(): string {
  return (
    getSetting("agent_system_prompt") ??
    `你是一个专业的会议记录分析助手。分析会议记录，生成结构化总结，包含：
1. 会议概述（时间、参与者、主要议题）
2. 关键讨论点
3. 决策与结论
4. 待办事项（如有）
5. 跨会议洞察（结合历史发言，分析参与者行为模式）
用中文输出，Markdown 格式。`
  );
}

// ---------- SQLite tool implementations ----------

function getMeetingTranscriptImpl(meetingId: string): string {
  const db = getDb();
  const meeting = db.prepare("SELECT * FROM meetings WHERE id = ?").get(meetingId) as {
    id: string; title: string | null; started_at: number; ended_at: number | null;
  } | undefined;
  if (!meeting) return JSON.stringify({ error: `会议 ${meetingId} 不存在` });

  const utts = db.prepare(`
    SELECT u.text, u.start_ms, u.end_ms, u.confidence, u.needs_review,
           s.name AS speaker_name
    FROM utterances u
    LEFT JOIN speakers s ON s.id = u.speaker_id
    WHERE u.meeting_id = ?
    ORDER BY u.start_ms ASC
  `).all(meetingId) as Array<{
    text: string; start_ms: number; end_ms: number;
    confidence: number; needs_review: number; speaker_name: string | null;
  }>;

  return JSON.stringify({
    meeting: { id: meeting.id, title: meeting.title, startedAt: meeting.started_at, endedAt: meeting.ended_at },
    utterances: utts.map((u) => ({
      speaker: u.speaker_name ?? "未知",
      text: u.text,
      startMs: u.start_ms,
      endMs: u.end_ms,
      confidence: Math.round(u.confidence * 100),
      needsReview: !!u.needs_review,
    })),
  });
}

function listSpeakersImpl(): string {
  const rows = getDb().prepare(`
    SELECT s.id, s.name, s.sample_count,
           (SELECT MAX(u.created_at) FROM utterances u WHERE u.speaker_id = s.id) AS last_seen
    FROM speakers s ORDER BY s.sample_count DESC
  `).all() as Array<{ id: string; name: string; sample_count: number; last_seen: number | null }>;
  return JSON.stringify({ speakers: rows.map((r) => ({ id: r.id, name: r.name, sampleCount: r.sample_count, lastSeen: r.last_seen })) });
}

function searchSpeakerHistoryImpl(speakerId: string, limit: number): string {
  const db = getDb();
  const speaker = db.prepare("SELECT id, name, sample_count FROM speakers WHERE id = ?").get(speakerId) as {
    id: string; name: string; sample_count: number;
  } | undefined;
  if (!speaker) return JSON.stringify({ error: `说话人 ${speakerId} 不存在` });

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

  return JSON.stringify({
    speaker: { id: speaker.id, name: speaker.name, totalUtterances: speaker.sample_count },
    recentUtterances: rows.map((r) => ({ text: r.text, meetingTitle: r.meeting_title, meetingId: r.meeting_id, startedAt: r.started_at })),
  });
}

function searchPastMeetingsImpl(searchQuery: string, limit: number): string {
  const rows = getDb().prepare(`
    SELECT u.text, s.name AS speaker_name,
           m.id AS meeting_id, m.title AS meeting_title, m.started_at
    FROM utterances u
    LEFT JOIN speakers s ON s.id = u.speaker_id
    LEFT JOIN meetings m ON m.id = u.meeting_id
    WHERE u.text LIKE ?
    ORDER BY m.started_at DESC
    LIMIT ?
  `).all(`%${searchQuery}%`, limit) as Array<{
    text: string; speaker_name: string | null;
    meeting_id: string; meeting_title: string | null; started_at: number;
  }>;

  return JSON.stringify({
    query: searchQuery,
    results: rows.map((r) => ({ text: r.text, speaker: r.speaker_name ?? "未知", meetingTitle: r.meeting_title, meetingId: r.meeting_id, startedAt: r.started_at })),
  });
}

// ---------- MCP server with SQLite tools ----------

export function createMeetingMcpServer() {
  return createSdkMcpServer({
    name: "meeting-db",
    tools: [
      tool(
        "get_meeting_transcript",
        "获取指定会议的完整发言记录，包含每句话的说话人、内容和时间戳",
        { meeting_id: z.string().describe("会议 ID") },
        async ({ meeting_id }) => ({ content: [{ type: "text" as const, text: getMeetingTranscriptImpl(meeting_id) }] }),
      ),
      tool(
        "list_speakers",
        "列出所有已知说话人及其发言次数",
        {},
        async () => ({ content: [{ type: "text" as const, text: listSpeakersImpl() }] }),
      ),
      tool(
        "search_speaker_history",
        "查询某个说话人在历史会议中的所有发言记录",
        { speaker_id: z.string().describe("说话人 ID"), limit: z.number().optional().describe("返回条数，默认20") },
        async ({ speaker_id, limit }) => ({ content: [{ type: "text" as const, text: searchSpeakerHistoryImpl(speaker_id, limit ?? 20) }] }),
      ),
      tool(
        "search_past_meetings",
        "全文搜索历史会议中包含特定关键词的发言",
        { query: z.string().describe("搜索关键词"), limit: z.number().optional().describe("返回条数，默认5") },
        async ({ query: q, limit }) => ({ content: [{ type: "text" as const, text: searchPastMeetingsImpl(q, limit ?? 5) }] }),
      ),
    ],
  });
}

// ---------- Memory helpers ----------

export function saveSummaryMemory(meetingId: string, markdown: string, dataDir: string): void {
  const memDir = path.join(dataDir, "agent-memory");
  fs.mkdirSync(memDir, { recursive: true });
  fs.writeFileSync(path.join(memDir, `meeting_${meetingId}.md`), markdown, "utf-8");
}

export function loadPastSummaries(dataDir: string, limit = 5): string {
  const memDir = path.join(dataDir, "agent-memory");
  if (!fs.existsSync(memDir)) return "";
  const files = fs
    .readdirSync(memDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .slice(-limit);
  if (files.length === 0) return "";
  return files
    .map((f) => `### ${f.replace(/^meeting_/, "").replace(/\.md$/, "")}\n${fs.readFileSync(path.join(memDir, f), "utf-8")}`)
    .join("\n\n---\n\n");
}

// ---------- Run summary via claude-agent-sdk ----------

export interface SummaryEvent {
  type: "text_delta" | "tool_use" | "tool_result" | "done" | "error";
  data: Record<string, unknown>;
}

export async function* runSummaryAgent(meetingId: string): AsyncGenerator<SummaryEvent> {
  const env = getAgentEnv();
  const model = getModel();
  const dataDir = getDataDir();
  const mcpServer = createMeetingMcpServer();

  // Build system prompt: base instructions + historical summaries for cross-session memory
  const pastSummaries = loadPastSummaries(dataDir);
  const systemPrompt = getSystemPrompt() +
    (pastSummaries ? `\n\n## 历史会议记忆\n\n${pastSummaries}` : "");

  const prompt = `请分析会议 ID "${meetingId}" 的记录并生成总结。先用工具获取会议内容，再结合历史说话人信息和上方的历史记忆做深度分析。`;

  let finalText = "";

  try {
    const agentQuery = query({
      prompt,
      options: {
        model,
        env,
        systemPrompt,
        cwd: path.join(dataDir, ".."),
        mcpServers: { "meeting-db": mcpServer },
        allowedTools: [
          "mcp__meeting-db__get_meeting_transcript",
          "mcp__meeting-db__list_speakers",
          "mcp__meeting-db__search_speaker_history",
          "mcp__meeting-db__search_past_meetings",
        ],
        disallowedTools: ["Bash", "Edit", "Write", "Read", "Glob", "Grep"],
        permissionMode: "dontAsk",
        persistSession: false,
      },
    });

    for await (const msg of agentQuery as AsyncIterable<SDKMessage>) {
      if (msg.type === "assistant") {
        const content = (msg.message as { content: unknown[] }).content ?? [];
        for (const block of content) {
          const b = block as { type: string; text?: string; name?: string; input?: unknown };
          if (b.type === "text" && b.text) {
            finalText += b.text;
            yield { type: "text_delta", data: { text: b.text } };
          } else if (b.type === "tool_use") {
            yield { type: "tool_use", data: { name: b.name, input: b.input } };
          }
        }
      } else if (msg.type === "user") {
        const content = (msg.message as { content: unknown[] }).content ?? [];
        for (const block of content) {
          const b = block as { type: string; content?: unknown };
          if (b.type === "tool_result") {
            const resultText = Array.isArray(b.content)
              ? (b.content[0] as { text?: string })?.text ?? ""
              : String(b.content ?? "");
            try {
              yield { type: "tool_result", data: JSON.parse(resultText) };
            } catch {
              yield { type: "tool_result", data: { raw: resultText } };
            }
          }
        }
      }
    }

    if (finalText) saveSummaryMemory(meetingId, finalText, dataDir);
    yield { type: "done", data: { summary: finalText } };
  } catch (e: unknown) {
    yield { type: "error", data: { error: e instanceof Error ? e.message : String(e) } };
  }
}
