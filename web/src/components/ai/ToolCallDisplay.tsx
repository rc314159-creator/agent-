"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Check,
  Loader2,
  X,
  Wrench,
  Search,
  FileText,
  Sparkles,
  Globe,
} from "lucide-react";

export type ToolCallStatus = "pending" | "completed" | "failed";

export interface ToolCallInfo {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
  status: ToolCallStatus;
  startedAt: number;
  finishedAt?: number;
}

// Friendly names and icons for known tools
const TOOL_META: Record<string, { label: string; icon: typeof Wrench }> = {
  searchWeb: { label: "搜索网络", icon: Search },
  getCanvasContent: { label: "读取画布", icon: FileText },
  getTranscripts: { label: "读取转录", icon: FileText },
  generateSummary: { label: "生成总结", icon: Sparkles },
  updateOutline: { label: "更新大纲", icon: FileText },
  webFetch: { label: "访问网页", icon: Globe },
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

interface ToolCallDisplayProps {
  toolCall: ToolCallInfo;
  compact?: boolean;
}

export function ToolCallDisplay({ toolCall, compact = false }: ToolCallDisplayProps) {
  const [expanded, setExpanded] = useState(false);

  const meta = TOOL_META[toolCall.name];
  const ToolIcon = meta?.icon ?? Wrench;
  const toolLabel = meta?.label ?? toolCall.name;

  const statusIcon = {
    pending: <Loader2 size={11} className="animate-spin text-violet-400" />,
    completed: <Check size={11} className="text-emerald-400" />,
    failed: <X size={11} className="text-red-400" />,
  }[toolCall.status];

  const duration =
    toolCall.finishedAt && toolCall.startedAt
      ? toolCall.finishedAt - toolCall.startedAt
      : null;

  return (
    <div
      className={`rounded-lg border overflow-hidden transition-colors ${
        toolCall.status === "pending"
          ? "border-violet-500/20 bg-violet-500/5"
          : toolCall.status === "failed"
          ? "border-red-500/20 bg-red-500/5"
          : "border-border/50 bg-muted/30"
      } ${compact ? "text-[11px]" : ""}`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full px-2.5 py-1.5 text-left hover:bg-muted/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown size={compact ? 10 : 11} className="text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight size={compact ? 10 : 11} className="text-muted-foreground shrink-0" />
        )}
        <ToolIcon size={compact ? 10 : 11} className="text-violet-400 shrink-0" />
        <span className={`font-mono font-medium truncate ${compact ? "text-[11px]" : "text-xs"}`}>
          {toolLabel}
        </span>
        <span className="ml-auto flex items-center gap-1.5 shrink-0">
          {duration != null && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {formatDuration(duration)}
            </span>
          )}
          {statusIcon}
        </span>
      </button>

      {expanded && (
        <div className={`border-t border-border/50 px-2.5 py-2 space-y-2 ${compact ? "text-[10px]" : "text-[11px]"}`}>
          {Object.keys(toolCall.input).length > 0 && (
            <div>
              <div className="text-muted-foreground font-medium mb-1">输入</div>
              <pre className="text-foreground/80 font-mono whitespace-pre-wrap break-all bg-background/50 rounded-md p-2 max-h-[200px] overflow-auto">
                {JSON.stringify(toolCall.input, null, 2)}
              </pre>
            </div>
          )}
          {toolCall.output && (
            <div>
              <div className="text-muted-foreground font-medium mb-1">输出</div>
              <pre className="text-foreground/80 font-mono whitespace-pre-wrap break-all bg-background/50 rounded-md p-2 max-h-[200px] overflow-auto">
                {toolCall.output.length > 2000
                  ? toolCall.output.slice(0, 2000) + "..."
                  : toolCall.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
