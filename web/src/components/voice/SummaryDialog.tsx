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
import { Copy, Check, Download, Sparkles, Loader2 } from "lucide-react";

interface SummaryDialogProps {
  open: boolean;
  onClose: () => void;
  summary: string;
  loading?: boolean;
}

export function SummaryDialog({ open, onClose, summary, loading }: SummaryDialogProps) {
  const [copied, setCopied] = useState(false);

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
            {!loading && summary && (
              <Badge
                variant="outline"
                className="text-[9px] px-1.5 py-0 border-emerald-500/30 text-emerald-400 ml-auto"
              >
                已完成
              </Badge>
            )}
            {loading && (
              <Badge
                variant="outline"
                className="text-[9px] px-1.5 py-0 border-violet-500/30 text-violet-400 ml-auto"
              >
                生成中...
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
            <p className="text-xs text-muted-foreground">正在分析转录内容...</p>
          </div>
        ) : !summary ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Sparkles className="w-8 h-8 text-violet-400/30" />
            <p className="text-xs text-muted-foreground">暂无总结内容</p>
          </div>
        ) : (
          <>
            {/* Full summary */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                总结报告
              </p>
              <div className="rounded-lg bg-muted/30 border border-border/30 p-3 text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap max-h-[50vh] overflow-y-auto">
                {summary}
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
