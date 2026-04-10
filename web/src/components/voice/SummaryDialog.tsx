"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, Download, Sparkles } from "lucide-react";

interface SummaryDialogProps {
  open: boolean;
  onClose: () => void;
  summary: string;
}

const actionItems = [
  { id: 1, text: "完成用户画像和需求调研", done: false },
  { id: 2, text: "输出竞品分析报告", done: false },
  { id: 3, text: "确定 MVP 功能列表", done: false },
];

const keyPoints = [
  { label: "核心痛点", value: "多平台切换成本高、学习门槛高、移动端体验差", color: "text-blue-300 border-blue-500/30 bg-blue-500/10" },
  { label: "产品定位", value: "Z世代职场人轻量化智能协作助手", color: "text-violet-300 border-violet-500/30 bg-violet-500/10" },
  { label: "核心策略", value: "轻量化 + 移动优先 + AI 增强", color: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" },
  { label: "商业模式", value: "Freemium：基础版免费，高级 AI 付费", color: "text-amber-300 border-amber-500/30 bg-amber-500/10" },
];

export function SummaryDialog({ open, onClose, summary }: SummaryDialogProps) {
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);

  const toggleItem = useCallback((id: number) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable
    }
  }, [summary]);

  const handleExport = useCallback(() => {
    const blob = new Blob([summary], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "会议总结.md";
    a.click();
    URL.revokeObjectURL(url);
  }, [summary]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
              <Sparkles className="w-3 h-3 text-white" />
            </div>
            AI 一键总结
            <Badge
              variant="outline"
              className="text-[9px] px-1.5 py-0 border-emerald-500/30 text-emerald-400 ml-auto"
            >
              已完成
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Key points */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            核心要点
          </p>
          <div className="grid grid-cols-2 gap-2">
            {keyPoints.map((kp) => (
              <div
                key={kp.label}
                className={`rounded-lg border px-3 py-2 ${kp.color}`}
              >
                <p className="text-[10px] font-medium mb-0.5 opacity-70">{kp.label}</p>
                <p className="text-[11px] leading-snug">{kp.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Full summary */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            详细总结
          </p>
          <div className="rounded-lg bg-muted/30 border border-border/30 p-3 text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
            {summary}
          </div>
        </div>

        {/* Action items */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            行动项
          </p>
          <div className="space-y-1.5">
            {actionItems.map((item) => (
              <button
                key={item.id}
                onClick={() => toggleItem(item.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors text-left"
              >
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    checkedItems.has(item.id)
                      ? "bg-emerald-500 border-emerald-500"
                      : "border-border/60"
                  }`}
                >
                  {checkedItems.has(item.id) && (
                    <Check className="w-2.5 h-2.5 text-white" />
                  )}
                </div>
                <span
                  className={`text-xs transition-colors ${
                    checkedItems.has(item.id)
                      ? "line-through text-muted-foreground"
                      : "text-foreground/80"
                  }`}
                >
                  {item.text}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs gap-1.5"
            onClick={handleCopy}
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                已复制
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                复制
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs gap-1.5 border-violet-500/30 text-violet-300 hover:bg-violet-500/10"
            onClick={handleExport}
          >
            <Download className="w-3 h-3" />
            导出 .md
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
