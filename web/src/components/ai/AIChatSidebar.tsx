"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { useAIToggle } from "@/hooks/useAIToggle";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  displayContent: string; // shown content (for streaming)
  timestamp: Date;
  streaming?: boolean;
}

const quickActions = [
  {
    icon: FileText,
    label: "总结讨论",
    prompt: "请帮我总结当前画布上的讨论要点，生成结构化的会议纪要。",
  },
  {
    icon: Search,
    label: "搜索资讯",
    prompt: "请搜索与当前讨论话题相关的最新行业动态和数据。",
  },
  {
    icon: Wand2,
    label: "自动填充",
    prompt: "请根据语音转录内容，自动补充和完善画布上的笔记。",
  },
];

const MAX_CHARS = 500;

const WELCOME_MSG: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "你好！我是 Midflow AI 助手。我可以帮你：\n\n- 总结讨论要点\n- 搜索相关资讯\n- 自动填充画布内容\n- 竞品分析 / 用户画像 / MVP 规划\n\n有什么需要帮忙的？",
  displayContent:
    "你好！我是 Midflow AI 助手。我可以帮你：\n\n- 总结讨论要点\n- 搜索相关资讯\n- 自动填充画布内容\n- 竞品分析 / 用户画像 / MVP 规划\n\n有什么需要帮忙的？",
  timestamp: new Date(),
};

interface AIChatSidebarProps {
  open: boolean;
  onClose: () => void;
}

export function AIChatSidebar({ open, onClose }: AIChatSidebarProps) {
  const { aiEnabled } = useAIToggle();
  const [messages, setMessages] = useState<Message[]>([WELCOME_MSG]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isTyping) return;

      // Cancel any ongoing stream
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
        setMessages((prev) =>
          prev.map((m) =>
            m.streaming ? { ...m, displayContent: m.content, streaming: false } : m
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

      // Build conversation history for API
      const apiMessages = messages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, content: m.content }));
      apiMessages.push({ role: "user", content: text.trim() });

      try {
        const controller = new AbortController();
        abortRef.current = controller;

        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMessages, stream: true }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errData = await res.text();
          setIsTyping(false);
          setMessages((prev) => [
            ...prev,
            { ...assistantMsg, content: `API 错误: ${errData}`, displayContent: `API 错误: ${errData}`, streaming: false },
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

        // Finalize
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
            { ...assistantMsg, content: `连接失败: ${(err as Error).message}`, displayContent: `连接失败: ${(err as Error).message}`, streaming: false },
          ]);
        }
      }
    },
    [isTyping, messages]
  );

  const handleClearChat = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setMessages([WELCOME_MSG]);
    setIsTyping(false);
  }, []);

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
      className="w-96 border-l border-border/50 bg-background/80 backdrop-blur-xl flex flex-col shrink-0 overflow-hidden">
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

      {/* Quick actions */}
      <div className="px-3 py-2 border-b border-border/30 flex gap-1.5 flex-wrap">
        {quickActions.map((action) => (
          <button
            key={action.label}
            onClick={() => sendMessage(action.prompt)}
            disabled={isTyping}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] bg-violet-500/10 text-violet-300 hover:bg-violet-500/25 active:bg-violet-500/30 transition-colors border border-violet-500/20 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
          >
            <action.icon className="w-3 h-3" />
            {action.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
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
                <span className="text-xs text-muted-foreground">思考中...</span>
              </div>
            </div>
          )}
          <div ref={scrollEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-3 border-t border-border/30">
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
            className={`min-h-9 max-h-24 text-xs resize-none ${overLimit ? "border-red-500/50 focus-visible:ring-red-500/30" : ""}`}
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
    </motion.aside>
      )}
    </AnimatePresence>
  );
}
