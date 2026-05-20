import { NextRequest } from "next/server";
import { getDb, getChatMessages, saveChatMessage } from "@/lib/db";
import { runChatAgent } from "@/lib/agent";

export const runtime = "nodejs";

// 如果会议还没有任何 chat 历史就触发一次默认总结，避免空文件下载
const AUTO_SUMMARY_PROMPT = "请帮我总结一下这次会议，覆盖：议题概述、关键讨论点、决策与结论、待办事项（如有）、跨会议洞察（结合历史发言）。";

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

  let messages = getChatMessages(id);
  // 空历史 → 自动跑一次总结，把结果写入 meeting_chats，再返回完整 markdown
  if (messages.length === 0) {
    try {
      saveChatMessage(id, "user", AUTO_SUMMARY_PROMPT);
      let assistantText = "";
      for await (const evt of runChatAgent(id, AUTO_SUMMARY_PROMPT)) {
        if (evt.type === "text_delta") assistantText += (evt.data.text as string) ?? "";
      }
      if (assistantText) saveChatMessage(id, "assistant", assistantText);
      messages = getChatMessages(id);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return new Response(`# AI 问答记录 — ${meeting.title ?? id}\n\n下载时尝试触发默认总结失败：${errMsg}\n\n请前往会议详情页右栏点击「显示推荐问题」手动发起一次问答后再下载。\n`, {
        status: 200,
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
      });
    }
  }
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
