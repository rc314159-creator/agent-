"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import {
  FileText,
  Search,
  MessageSquare,
  Wand2,
  ChevronUp,
  ChevronDown,
  Send,
  Sparkles,
  Check,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { useAIToggle } from "@/hooks/useAIToggle";
import { useWorkspace } from "@/hooks/useWorkspace";

type ChatMsg = { role: "user" | "assistant"; content: string };

export function AIPanel() {
  const { aiEnabled } = useAIToggle();
  const workspace = useWorkspace();
  const [expanded, setExpanded] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ title: string; url: string; content: string; score?: number }>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [autoFillDone, setAutoFillDone] = useState(false);
  const [autoFillLoading, setAutoFillLoading] = useState(false);
  const [summaryText, setSummaryText] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const chatMessagesRef = useRef<ChatMsg[]>([]);

  // Generate summary based on REAL workspace content
  const handleGenerateSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryText("");
    const context = workspace.getContextSummary();
    if (!context.trim()) {
      setSummaryText("当前没有画布内容或语音转录，无法生成总结。请先在画布上编辑内容或进行语音录制。");
      setSummaryLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "请根据以下工作区内容，生成一份结构化的会议总结报告，包含：核心要点、详细总结、行动项。使用 Markdown 格式。" }],
          context,
          stream: false,
        }),
      });
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content ?? data.text ?? "";
      setSummaryText(content || "未能生成总结内容。");
    } catch {
      setSummaryText("生成失败，请重试。");
    } finally {
      setSummaryLoading(false);
    }
  }, [workspace]);

  // Chat with workspace context
  const handleChatSend = useCallback(async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg: ChatMsg = { role: "user", content: chatInput.trim() };
    const updatedMessages = [...chatMessagesRef.current, userMsg];
    chatMessagesRef.current = updatedMessages;
    setChatMessages([...updatedMessages]);
    setChatInput("");
    setChatLoading(true);

    const assistantMsg: ChatMsg = { role: "assistant", content: "" };
    chatMessagesRef.current = [...updatedMessages, assistantMsg];
    setChatMessages([...chatMessagesRef.current]);

    const context = workspace.getContextSummary();

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages,
          context,
          stream: true,
        }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("No response body");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                const last = chatMessagesRef.current[chatMessagesRef.current.length - 1];
                const updated = { ...last, content: last.content + delta };
                chatMessagesRef.current = [
                  ...chatMessagesRef.current.slice(0, -1),
                  updated,
                ];
                setChatMessages([...chatMessagesRef.current]);
              }
            } catch {
              // ignore malformed SSE lines
            }
          }
        }
      }
    } catch {
      const last = chatMessagesRef.current[chatMessagesRef.current.length - 1];
      const updated = { ...last, content: "请求失败，请重试。" };
      chatMessagesRef.current = [
        ...chatMessagesRef.current.slice(0, -1),
        updated,
      ];
      setChatMessages([...chatMessagesRef.current]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, workspace]);

  // REAL search via SearXNG
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setSearchResults([]);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery.trim(), count: 5 }),
      });
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        setSearchResults(data.results);
      } else {
        setSearchResults([{ title: "未找到结果", url: "", content: data.error || `没有找到与"${searchQuery}"相关的结果。`, score: 0 }]);
      }
    } catch {
      setSearchResults([{ title: "搜索失败", url: "", content: "搜索服务暂不可用，请稍后重试。", score: 0 }]);
    } finally {
      setSearchLoading(false);
    }
  }, [searchQuery]);

  // REAL auto-fill: read transcripts → AI generates notes → write to outline
  const handleAutoFill = useCallback(async () => {
    const transcripts = workspace.transcripts;
    if (transcripts.length === 0) {
      setAutoFillDone(false);
      return;
    }
    setAutoFillLoading(true);
    try {
      const transcriptText = transcripts
        .map((t) => `[${t.speaker}] ${t.time}: ${t.text}`)
        .join("\n");
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: `请根据以下语音转录内容，生成结构化的 HTML 笔记（使用 h2、ul、li 标签），可以直接插入到大纲编辑器中。只返回 HTML 内容，不要返回其他文字。\n\n转录内容：\n${transcriptText}`,
            },
          ],
          stream: false,
        }),
      });
      const data = await res.json();
      const html = data.choices?.[0]?.message?.content ?? data.text ?? "";
      if (html.trim()) {
        // Append generated notes to outline
        const current = workspace.outlineHTML;
        const separator = current ? "\n<hr/>\n<h2>AI 自动填充笔记</h2>\n" : "";
        workspace.setOutlineHTML(current + separator + html);
      }
      setAutoFillLoading(false);
      setAutoFillDone(true);
      setTimeout(() => setAutoFillDone(false), 3000);
    } catch {
      setAutoFillLoading(false);
    }
  }, [workspace]);

  if (!aiEnabled) return null;

  return (
    <div
      className={`border-t border-border/50 bg-background/80 backdrop-blur-xl transition-all duration-300 ${
        expanded ? "h-80" : "h-12"
      }`}
    >
      {/* Toggle bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full h-12 flex items-center justify-between px-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-medium">AI 辅助</span>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {/* Content */}
      {expanded && (
        <div className="h-[calc(100%-3rem)] px-4 pb-3">
          <Tabs defaultValue="summary" className="h-full flex flex-col">
            <TabsList className="w-full justify-start bg-muted/30 h-8">
              <TabsTrigger value="summary" className="text-xs gap-1.5 h-6">
                <FileText className="w-3 h-3" />
                总结报告
              </TabsTrigger>
              <TabsTrigger value="search" className="text-xs gap-1.5 h-6">
                <Search className="w-3 h-3" />
                信息检索
              </TabsTrigger>
              <TabsTrigger value="chat" className="text-xs gap-1.5 h-6">
                <MessageSquare className="w-3 h-3" />
                智能问答
              </TabsTrigger>
              <TabsTrigger value="autofill" className="text-xs gap-1.5 h-6">
                <Wand2 className="w-3 h-3" />
                自动填充
              </TabsTrigger>
            </TabsList>

            <TabsContent value="summary" className="flex-1 mt-2 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="pr-4">
                  <Button
                    size="sm"
                    className="mb-3 gap-1.5 bg-violet-600 hover:bg-violet-700"
                    onClick={handleGenerateSummary}
                    disabled={summaryLoading}
                  >
                    {summaryLoading ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    {summaryLoading ? "生成中..." : "生成总结"}
                  </Button>
                  {summaryText && (
                    <div className="text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap">
                      {summaryText}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="search" className="flex-1 mt-2 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="space-y-2 pr-4">
                  <div className="flex gap-2 mb-3">
                    <Textarea
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSearch(); } }}
                      placeholder="搜索真实网络信息..."
                      className="h-8 min-h-8 text-xs resize-none"
                    />
                    <Button size="sm" className="shrink-0 gap-1" onClick={handleSearch} disabled={searchLoading}>
                      {searchLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                    </Button>
                  </div>
                  {searchLoading ? (
                    <div className="flex items-center justify-center py-6 gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                      <span className="text-xs text-muted-foreground">搜索中...</span>
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="flex items-center justify-center py-6">
                      <span className="text-xs text-muted-foreground">输入关键词开始搜索（接入 SearXNG 真实搜索引擎）</span>
                    </div>
                  ) : (
                    searchResults.map((result, i) => (
                      <Card
                        key={i}
                        className="p-3 bg-card/50 border-border/50 hover:bg-card transition-colors cursor-pointer"
                        onClick={() => result.url && window.open(result.url, "_blank")}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-xs font-medium">{result.title}</h4>
                          {result.url && <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />}
                        </div>
                        {result.url && (
                          <p className="text-[10px] text-violet-400 mt-0.5 truncate">
                            {result.url}
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed line-clamp-3">
                          {result.content}
                        </p>
                      </Card>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="chat" className="flex-1 mt-2 flex flex-col overflow-hidden">
              <ScrollArea className="flex-1">
                <div className="space-y-3 pr-4">
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                          msg.role === "user"
                            ? "bg-violet-600/20 text-violet-100"
                            : "bg-muted/50 text-foreground/80"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <div className="flex gap-2 mt-2 shrink-0">
                <Textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
                  placeholder="基于画布和转录内容提问..."
                  className="h-8 min-h-8 text-xs resize-none"
                  disabled={chatLoading}
                />
                <Button size="icon" className="h-8 w-8 shrink-0" onClick={handleChatSend} disabled={chatLoading}>
                  {chatLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="autofill" className="flex-1 mt-2 overflow-hidden">
              <div className="flex flex-col items-center justify-center h-full gap-3">
                {autoFillDone ? (
                  <Check className="w-8 h-8 text-emerald-400" />
                ) : autoFillLoading ? (
                  <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
                ) : (
                  <Wand2 className="w-8 h-8 text-violet-400/50" />
                )}
                <p className="text-xs text-muted-foreground text-center">
                  {autoFillDone
                    ? "已根据转录内容填充到大纲"
                    : workspace.transcripts.length === 0
                    ? "请先进行语音录制，才能自动填充"
                    : `根据 ${workspace.transcripts.length} 条转录记录自动生成画布笔记`}
                </p>
                <Button
                  size="sm"
                  className="gap-1.5 bg-violet-600 hover:bg-violet-700"
                  onClick={handleAutoFill}
                  disabled={autoFillLoading || autoFillDone || workspace.transcripts.length === 0}
                >
                  {autoFillLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : autoFillDone ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <Wand2 className="w-3 h-3" />
                  )}
                  {autoFillLoading ? "填充中..." : autoFillDone ? "已完成" : "开始自动填充"}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
