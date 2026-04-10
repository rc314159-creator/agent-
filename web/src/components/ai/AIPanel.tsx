"use client";

import { useState, useCallback } from "react";
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
} from "lucide-react";
import { useAIToggle } from "@/hooks/useAIToggle";
import {
  mockSummary,
  mockSearchResults,
  mockChatMessages,
} from "@/lib/mock-data";

type ChatMsg = { role: "user" | "assistant"; content: string };

export function AIPanel() {
  const { aiEnabled } = useAIToggle();
  const [expanded, setExpanded] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>(mockChatMessages as ChatMsg[]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredResults, setFilteredResults] = useState(mockSearchResults);
  const [autoFillDone, setAutoFillDone] = useState(false);
  const [autoFillLoading, setAutoFillLoading] = useState(false);

  const handleChatSend = useCallback(() => {
    if (!chatInput.trim()) return;
    const userMsg: ChatMsg = { role: "user", content: chatInput.trim() };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setTimeout(() => {
      const aiMsg: ChatMsg = { role: "assistant", content: "这是一个很好的问题。根据当前画布内容和讨论记录，我建议从用户需求出发，优先关注核心差异化功能点。具体来说：\n\n1. **AI 辅助记录**是最大的差异化优势\n2. 轻量化设计降低用户迁移成本\n3. 模板系统提升开箱即用体验" };
      setChatMessages((prev) => [...prev, aiMsg]);
    }, 800);
  }, [chatInput]);

  const handleSearch = useCallback(() => {
    if (!searchQuery.trim()) {
      setFilteredResults(mockSearchResults);
      return;
    }
    const q = searchQuery.toLowerCase();
    const results = mockSearchResults.filter(
      (r) => r.title.toLowerCase().includes(q) || r.summary.toLowerCase().includes(q)
    );
    setFilteredResults(results.length > 0 ? results : mockSearchResults);
  }, [searchQuery]);

  const handleAutoFill = useCallback(() => {
    setAutoFillLoading(true);
    setTimeout(() => {
      setAutoFillLoading(false);
      setAutoFillDone(true);
      setTimeout(() => setAutoFillDone(false), 2000);
    }, 1500);
  }, []);

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
                  >
                    <Sparkles className="w-3 h-3" />
                    生成总结
                  </Button>
                  <div className="text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap">
                    {mockSummary}
                  </div>
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
                      placeholder="输入关键词搜索时政消息或产品动态..."
                      className="h-8 min-h-8 text-xs resize-none"
                    />
                    <Button size="sm" className="shrink-0 gap-1" onClick={handleSearch}>
                      <Search className="w-3 h-3" />
                    </Button>
                  </div>
                  {filteredResults.map((result, i) => (
                    <Card
                      key={i}
                      className="p-3 bg-card/50 border-border/50 hover:bg-card transition-colors cursor-pointer"
                    >
                      <h4 className="text-xs font-medium">{result.title}</h4>
                      <p className="text-[10px] text-violet-400 mt-0.5">
                        {result.source}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                        {result.summary}
                      </p>
                    </Card>
                  ))}
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
                />
                <Button size="icon" className="h-8 w-8 shrink-0" onClick={handleChatSend}>
                  <Send className="w-3 h-3" />
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
                  {autoFillDone ? "已根据转录内容填充到画布" : "根据语音转录内容自动生成画布笔记"}
                </p>
                <Button
                  size="sm"
                  className="gap-1.5 bg-violet-600 hover:bg-violet-700"
                  onClick={handleAutoFill}
                  disabled={autoFillLoading || autoFillDone}
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
