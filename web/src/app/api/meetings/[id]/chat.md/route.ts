import { NextRequest } from "next/server";
import { getDb, getChatMessages } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();

  const meeting = db.prepare("SELECT id, title, started_at FROM meetings WHERE id = ?").get(id) as {
    id: string; title: string | null; started_at: number;
  } | undefined;

  if (!meeting) {
    return new Response("Not Found", { status: 404 });
  }

  const messages = getChatMessages(id);
  const title = meeting.title ?? id;
  const startDate = new Date(meeting.started_at).toLocaleString("zh-CN");

  const lines = [
    `# AI 问答记录 — ${title}`,
    "",
    `**时间：** ${startDate}`,
    "",
    "---",
    "",
  ];

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === "user") {
      lines.push(`**用户：** ${m.content}`);
      lines.push("");
    } else {
      lines.push(`**AI：**`);
      lines.push(m.content);
      lines.push("");
      lines.push("---");
      lines.push("");
    }
  }

  const content = lines.join("\n");
  const filename = encodeURIComponent(`AI对话-${title}.md`);

  return new Response(content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
