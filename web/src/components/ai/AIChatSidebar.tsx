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

const mockResponses: Record<string, string> = {
  总结:
    "## 讨论要点总结\n\n**核心问题**: 协同办公工具存在平台切换成本高、学习门槛高、移动端体验差三大痛点。\n\n**产品定位**: 面向Z世代职场人的轻量化智能协作助手。\n\n**关键策略**:\n1. 轻量化 + 移动优先\n2. AI 增强核心功能\n3. Freemium 商业模式\n\n**竞品差异化**: 相比飞书更轻量、相比 Notion 学习成本更低、相比钉钉更年轻化。",
  搜索:
    "为您找到以下相关资讯：\n\n1. **艾瑞咨询 2026 协同办公报告** — 市场规模达 680 亿元，移动办公占比 67%\n2. **36氪 Z世代调查** — 73% 偏好轻量化工具，AI 辅助是第二关注点\n3. **飞书 2026 数据** — 企业版用户 800 万，但移动端日均时长仅桌面端 1/3",
  填充:
    "已根据转录内容分析，建议补充以下内容到画布：\n\n1. **用户痛点细化**: Speaker C 提到竞品调研数据可以补充到竞品分析表\n2. **策略补充**: Speaker D 关于 AI 弥补功能缺失的观点可以展开\n3. **行动项**: 需要明确每项任务的负责人和时间节点",
  竞品:
    "## 竞品分析\n\n| 产品 | 优势 | 劣势 | 定位 |\n|------|------|------|------|\n| 飞书 | 功能全、生态好 | 重、移动端差 | 企业全功能 |\n| Notion | 灵活、颜值高 | 学习成本高 | 个人/团队知识库 |\n| 钉钉 | 覆盖广 | 体验老旧 | 中大型企业 |\n| Midflow | 轻量、AI原生 | 生态待建立 | Z世代协作 |\n\n**差异化机会**: 在轻量化与 AI 增强的结合点上，目前市场存在明显空白。",
  用户画像:
    "## 目标用户画像\n\n**主要画像**: 职场新人 Lily\n- 年龄：22-28岁，Z世代\n- 职业：产品/运营/设计等创意岗位\n- 痛点：工具太多、切换成本高、AI 功能散乱\n- 期望：一个轻量、智能、好用的协作工具\n\n**次要画像**: 创业团队 Leader\n- 年龄：28-35岁\n- 需求：快速协作、AI 辅助决策\n- 预算敏感，注重ROI",
  MVP:
    "## MVP 功能建议\n\n**必做（核心）**:\n1. 语音实时转录 + AI 总结\n2. 轻量画布/白板\n3. AI 对话助手\n\n**可选（差异化）**:\n4. 移动端优先设计\n5. 一键生成会议纪要\n\n**暂缓（后期）**:\n6. 第三方集成\n7. 企业版权限管理\n\n建议以 8 周为 MVP 周期，先验证核心价值假设。",
};

const MAX_CHARS = 500;

function getAIResponse(input: string): string {
  for (const [key, value] of Object.entries(mockResponses)) {
    if (input.includes(key)) return value;
  }
  return `好的，关于你的问题"${input.slice(0, 30)}..."，我的分析如下：\n\n根据当前讨论的上下文，建议你们重点关注以下几个方面：\n\n1. **目标用户验证** — 需要进一步确认 Z 世代是否真的是最优目标群体\n2. **技术可行性** — AI 增强方案的具体实现路径需要明确\n3. **MVP 优先级** — 建议先做最核心的 3 个功能进行验证\n\n需要我进一步展开哪个方面？`;
}

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
  const streamRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const startStreamingResponse = useCallback((fullText: string) => {
    const msgId = (Date.now() + 1).toString();
    const newMsg: Message = {
      id: msgId,
      role: "assistant",
      content: fullText,
      displayContent: "",
      timestamp: new Date(),
      streaming: true,
    };
    setMessages((prev) => [...prev, newMsg]);
    setIsTyping(false);

    let charIndex = 0;
    const CHUNK = 3; // chars per tick for smooth speed

    streamRef.current = setInterval(() => {
      charIndex = Math.min(charIndex + CHUNK, fullText.length);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                displayContent: fullText.slice(0, charIndex),
                streaming: charIndex < fullText.length,
              }
            : m
        )
      );
      if (charIndex >= fullText.length) {
        clearInterval(streamRef.current!);
        streamRef.current = null;
      }
    }, 16); // ~60fps
  }, []);

  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim() || isTyping) return;

      // Cancel any ongoing stream
      if (streamRef.current) {
        clearInterval(streamRef.current);
        streamRef.current = null;
        // Finalize last streaming message
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

      const delay = 600 + Math.random() * 800;
      setTimeout(() => {
        startStreamingResponse(getAIResponse(text));
      }, delay);
    },
    [isTyping, startStreamingResponse]
  );

  const handleClearChat = useCallback(() => {
    if (streamRef.current) {
      clearInterval(streamRef.current);
      streamRef.current = null;
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
