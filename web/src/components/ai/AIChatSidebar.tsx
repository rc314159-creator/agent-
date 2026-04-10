"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Send,
  Sparkles,
  X,
  FileText,
  Search,
  Wand2,
  Bot,
  User,
  Loader2,
  Trash2,
  MessageSquare,
  Check,
  ExternalLink,
} from "lucide-react";
import { useAIToggle } from "@/hooks/useAIToggle";
import { useWorkspace } from "@/hooks/useWorkspace";
import { ToolCallDisplay, type ToolCallInfo } from "@/components/ai/ToolCallDisplay";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  displayContent: string;
  timestamp: Date;
  streaming?: boolean;
  toolCalls?: ToolCallInfo[];
}

const MAX_CHARS = 500;

const WELCOME_MSG: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "你好！我是 MeetFlow AI 助手。我可以帮你：\n\n- 总结画布和转录内容\n- 搜索真实网络资讯\n- 自动填充画布笔记\n- 竞品分析 / 用户画像 / MVP 规划\n\n有什么需要帮忙的？",
  displayContent:
    "你好！我是 MeetFlow AI 助手。我可以帮你：\n\n- 总结画布和转录内容\n- 搜索真实网络资讯\n- 自动填充画布笔记\n- 竞品分析 / 用户画像 / MVP 规划\n\n有什么需要帮忙的？",
  timestamp: new Date(),
};

interface AIChatSidebarProps {
  open: boolean;
  onClose: () => void;
}

export function AIChatSidebar({ open, onClose }: AIChatSidebarProps) {
  const { aiEnabled } = useAIToggle();
  const workspace = useWorkspace();

  // Chat tab state
  const [messages, setMessages] = useState<Message[]>([WELCOME_MSG]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);

  // Summary tab state
  const [summaryText, setSummaryText] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Search tab state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<{ title: string; url: string; content: string; score?: number }>
  >([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Auto-fill tab state
  const [autoFillDone, setAutoFillDone] = useState(false);
  const [autoFillLoading, setAutoFillLoading] = useState(false);

  // Tool call history (shown in a collapsible section)
  const [recentToolCalls, setRecentToolCalls] = useState<ToolCallInfo[]>([]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ---- Chat ----
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isTyping) return;

      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
        setMessages((prev) =>
          prev.map((m) =>
            m.streaming
              ? { ...m, displayContent: m.content, streaming: false }
              : m
          )
        );
      }

      const userMsg: Message = {
        id: Date.now().toString(),
        role: "user",
        content: text.trim(),
        displayContent: text.trim(),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setIsTyping(true);

      const msgId = (Date.now() + 1).toString();
      const assistantMsg: Message = {
        id: msgId,
        role: "assistant",
        content: "",
        displayContent: "",
        timestamp: new Date(),
        streaming: true,
      };

      const apiMessages = messages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, content: m.content }));
      apiMessages.push({ role: "user", content: text.trim() });

      const context = workspace.getContextSummary();

      try {
        const controller = new AbortController();
        abortRef.current = controller;

        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages, context, stream: true }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errData = await res.text();
          setIsTyping(false);
          setMessages((prev) => [
            ...prev,
            {
              ...assistantMsg,
              content: `API 错误: ${errData}`,
              displayContent: `API 错误: ${errData}`,
              streaming: false,
            },
          ]);
          return;
        }

        setIsTyping(false);
        setMessages((prev) => [...prev, assistantMsg]);

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") break;
                try {
                  const parsed = JSON.parse(data);
                  const delta = parsed.choices?.[0]?.delta?.content;
                  if (delta) {
                    accumulated += delta;
                    const current = accumulated;
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === msgId
                          ? { ...m, content: current, displayContent: current }
                          : m
                      )
                    );
                  }
                } catch {
                  // skip malformed SSE lines
                }
              }
            }
          }
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId ? { ...m, streaming: false } : m
          )
        );
        abortRef.current = null;
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setIsTyping(false);
          setMessages((prev) => [
            ...prev,
            {
              ...assistantMsg,
              content: `连接失败: ${(err as Error).message}`,
              displayContent: `连接失败: ${(err as Error).message}`,
              streaming: false,
            },
          ]);
        }
      }
    },
    [isTyping, messages, workspace]
  );

  const handleClearChat = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setMessages([WELCOME_MSG]);
    setIsTyping(false);
  }, []);

  // ---- Summary ----
  const handleGenerateSummary = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryText("");
    const context = workspace.getContextSummary();
    if (!context.trim()) {
      setSummaryText(
        "当前没有画布内容或语音转录，无法生成总结。请先在画布上编辑内容或进行语音录制。"
      );
      setSummaryLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content:
                "请根据以下工作区内容，生成一份结构化的会议总结报告，包含：核心要点、详细总结、行动项。使用 Markdown 格式。",
            },
          ],
          context,
          stream: false,
        }),
      });
      const data = await res.json();
      const content =
        data.choices?.[0]?.message?.content ?? data.text ?? "";
      setSummaryText(content || "未能生成总结内容。");
    } catch {
      setSummaryText("生成失败，请重试。");
    } finally {
      setSummaryLoading(false);
    }
  }, [workspace]);

  // ---- Search (with tool call tracking) ----
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setSearchResults([]);
    const tcId = `search-${Date.now()}`;
    const tc: ToolCallInfo = {
      id: tcId,
      name: "searchWeb",
      input: { query: searchQuery.trim(), count: 5 },
      status: "pending",
      startedAt: Date.now(),
    };
    setRecentToolCalls((prev) => [tc, ...prev].slice(0, 20));
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery.trim(), count: 5 }),
      });
      const data = await res.json();
      const resultCount = data.results?.length ?? 0;
      setRecentToolCalls((prev) =>
        prev.map((t) =>
          t.id === tcId
            ? { ...t, status: "completed" as const, finishedAt: Date.now(), output: `${resultCount} 条搜索结果` }
            : t
        )
      );
      if (data.results && data.results.length > 0) {
        setSearchResults(data.results);
      } else {
        setSearchResults([
          {
            title: "未找到结果",
            url: "",
            content:
              data.error ||
              `没有找到与"${searchQuery}"相关的结果。`,
            score: 0,
          },
        ]);
      }
    } catch {
      setRecentToolCalls((prev) =>
        prev.map((t) =>
          t.id === tcId
            ? { ...t, status: "failed" as const, finishedAt: Date.now(), output: "搜索服务不可用" }
            : t
        )
      );
      setSearchResults([
        {
          title: "搜索失败",
          url: "",
          content: "搜索服务暂不可用，请稍后重试。",
          score: 0,
        },
      ]);
    } finally {
      setSearchLoading(false);
    }
  }, [searchQuery]);

  // ---- Auto-fill ----
  const handleAutoFill = useCallback(async () => {
    const transcripts = workspace.transcripts;
    if (transcripts.length === 0) return;
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
        const current = workspace.outlineHTML;
        const separator = current
          ? "\n<hr/>\n<h2>AI 自动填充笔记</h2>\n"
          : "";
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

  const charCount = input.length;
  const overLimit = charCount > MAX_CHARS;

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ x: 60, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 60, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          className="w-96 border-l border-border/50 bg-background/80 backdrop-blur-xl flex flex-col shrink-0 overflow-hidden"
        >
          {/* Header */}
          <div className="h-12 border-b border-border/30 flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-white" />
              </div>
              <span className="text-sm font-medium">AI 助手</span>
              <Badge
                variant="outline"
                className="text-[9px] px-1.5 py-0 border-emerald-500/30 text-emerald-400"
              >
                在线
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={handleClearChat}
                title="清空对话"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onClose}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="chat" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="w-full justify-start bg-muted/30 h-9 rounded-none border-b border-border/30 px-2 shrink-0">
              <TabsTrigger value="chat" className="text-xs gap-1.5 h-7">
                <MessageSquare className="w-3 h-3" />
                对话
              </TabsTrigger>
              <TabsTrigger value="summary" className="text-xs gap-1.5 h-7">
                <FileText className="w-3 h-3" />
                总结
              </TabsTrigger>
              <TabsTrigger value="search" className="text-xs gap-1.5 h-7">
                <Search className="w-3 h-3" />
                搜索
              </TabsTrigger>
              <TabsTrigger value="autofill" className="text-xs gap-1.5 h-7">
                <Wand2 className="w-3 h-3" />
                自动填充
              </TabsTrigger>
            </TabsList>

            {/* Chat Tab */}
            <TabsContent
              value="chat"
              className="flex-1 flex flex-col overflow-hidden mt-0 data-[state=inactive]:hidden"
            >
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-4">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex gap-2 ${
                        msg.role === "user" ? "flex-row-reverse" : ""
                      }`}
                    >
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                          msg.role === "assistant"
                            ? "bg-gradient-to-br from-violet-500/30 to-indigo-500/30 border border-violet-500/20"
                            : "bg-blue-500/20 border border-blue-500/20"
                        }`}
                      >
                        {msg.role === "assistant" ? (
                          <Bot className="w-3 h-3 text-violet-400" />
                        ) : (
                          <User className="w-3 h-3 text-blue-400" />
                        )}
                      </div>
                      <div
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm ${
                          msg.role === "user"
                            ? "bg-violet-600/25 text-violet-100 rounded-tr-sm border border-violet-500/20"
                            : "bg-muted/60 text-foreground/85 rounded-tl-sm border border-border/30"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">
                          {msg.displayContent}
                          {msg.streaming && (
                            <span className="inline-block w-0.5 h-3 bg-violet-400 animate-pulse ml-0.5 align-middle" />
                          )}
                        </p>
                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            {msg.toolCalls.map((tc) => (
                              <ToolCallDisplay key={tc.id} toolCall={tc} compact />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="flex gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500/30 to-indigo-500/30 border border-violet-500/20 flex items-center justify-center shrink-0">
                        <Bot className="w-3 h-3 text-violet-400" />
                      </div>
                      <div className="bg-muted/60 border border-border/30 rounded-2xl rounded-tl-sm px-3.5 py-2.5 flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
                        <span className="text-xs text-muted-foreground">
                          思考中...
                        </span>
                      </div>
                    </div>
                  )}
                  <div ref={scrollEndRef} />
                </div>
              </ScrollArea>

              {/* Chat Input */}
              <div className="p-3 border-t border-border/30 shrink-0">
                <div className="flex gap-2">
                  <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage(input);
                      }
                    }}
                    placeholder="输入问题或指令..."
                    className={`min-h-9 max-h-24 text-xs resize-none ${
                      overLimit
                        ? "border-red-500/50 focus-visible:ring-red-500/30"
                        : ""
                    }`}
                    maxLength={MAX_CHARS + 50}
                  />
                  <Button
                    size="icon"
                    className="h-9 w-9 shrink-0 bg-violet-600 hover:bg-violet-700"
                    onClick={() => sendMessage(input)}
                    disabled={!input.trim() || isTyping || overLimit}
                  >
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-[10px] text-muted-foreground/50">
                    Enter 发送 · Shift+Enter 换行
                  </p>
                  <p
                    className={`text-[10px] tabular-nums ${
                      overLimit
                        ? "text-red-400"
                        : charCount > MAX_CHARS * 0.8
                        ? "text-amber-400"
                        : "text-muted-foreground/40"
                    }`}
                  >
                    {charCount}/{MAX_CHARS}
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* Summary Tab */}
            <TabsContent
              value="summary"
              className="flex-1 overflow-hidden mt-0 data-[state=inactive]:hidden"
            >
              <ScrollArea className="h-full">
                <div className="p-4">
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
                  {!summaryText && !summaryLoading && (
                    <p className="text-xs text-muted-foreground">
                      点击上方按钮，根据画布和转录内容自动生成会议总结报告。
                    </p>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Search Tab */}
            <TabsContent
              value="search"
              className="flex-1 overflow-hidden mt-0 data-[state=inactive]:hidden"
            >
              <ScrollArea className="h-full">
                <div className="p-4 space-y-2">
                  <div className="flex gap-2 mb-3">
                    <Textarea
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSearch();
                        }
                      }}
                      placeholder="搜索真实网络信息..."
                      className="h-8 min-h-8 text-xs resize-none"
                    />
                    <Button
                      size="sm"
                      className="shrink-0 gap-1"
                      onClick={handleSearch}
                      disabled={searchLoading}
                    >
                      {searchLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Search className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                  {searchLoading ? (
                    <div className="flex items-center justify-center py-6 gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                      <span className="text-xs text-muted-foreground">
                        搜索中...
                      </span>
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="flex items-center justify-center py-6">
                      <span className="text-xs text-muted-foreground">
                        输入关键词开始搜索（接入 SearXNG 真实搜索引擎）
                      </span>
                    </div>
                  ) : (
                    searchResults.map((result, i) => (
                      <Card
                        key={i}
                        className="p-3 bg-card/50 border-border/50 hover:bg-card transition-colors cursor-pointer"
                        onClick={() =>
                          result.url && window.open(result.url, "_blank")
                        }
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-xs font-medium">
                            {result.title}
                          </h4>
                          {result.url && (
                            <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                          )}
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

            {/* Auto-fill Tab */}
            <TabsContent
              value="autofill"
              className="flex-1 mt-0 data-[state=inactive]:hidden"
            >
              <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
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
                  disabled={
                    autoFillLoading ||
                    autoFillDone ||
                    workspace.transcripts.length === 0
                  }
                >
                  {autoFillLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : autoFillDone ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <Wand2 className="w-3 h-3" />
                  )}
                  {autoFillLoading
                    ? "填充中..."
                    : autoFillDone
                    ? "已完成"
                    : "开始自动填充"}
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {/* Tool Call History */}
          {recentToolCalls.length > 0 && (
            <div className="border-t border-border/30 px-3 py-2 shrink-0">
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                工具调用记录
              </div>
              <div className="space-y-1 max-h-32 overflow-auto">
                {recentToolCalls.slice(0, 5).map((tc) => (
                  <ToolCallDisplay key={tc.id} toolCall={tc} compact />
                ))}
              </div>
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
