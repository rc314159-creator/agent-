"use client";

import { cn } from "@/lib/utils";
import {
  FileText,
  GitBranch,
  PenTool,
  LayoutTemplate,
  Clock,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";

export type CanvasMode = "outline" | "mindmap" | "whiteboard" | "template";

interface SidebarProps {
  activeMode: CanvasMode;
  onModeChange: (mode: CanvasMode) => void;
}

const modes = [
  { id: "outline" as const, label: "大纲", icon: FileText, shortcut: "1", hasContent: true },
  { id: "mindmap" as const, label: "思维导图", icon: GitBranch, shortcut: "2", hasContent: false },
  { id: "whiteboard" as const, label: "白板", icon: PenTool, shortcut: "3", hasContent: false },
  { id: "template" as const, label: "模板", icon: LayoutTemplate, shortcut: "4", hasContent: true },
];

const actions = [
  { id: "history", label: "历史记录", icon: Clock },
  { id: "export", label: "导出", icon: Download },
];

export function Sidebar({ activeMode, onModeChange }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "border-r border-border/50 bg-background/60 backdrop-blur-xl flex flex-col shrink-0 transition-all duration-300",
        collapsed ? "w-14" : "w-48"
      )}
    >
      {/* Mode selection */}
      <div className="flex-1 py-3 px-2 space-y-1">
        {!collapsed && (
          <div className="px-2 mb-3">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              记录模式
            </span>
          </div>
        )}
        {modes.map((mode) => {
          const isActive = activeMode === mode.id;
          return (
            <button
              key={mode.id}
              onClick={() => onModeChange(mode.id)}
              title={collapsed ? `${mode.label} (${mode.shortcut})` : undefined}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-150 relative",
                collapsed && "justify-center px-0",
                isActive
                  ? "text-violet-300"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              {/* Animated active background */}
              {isActive && (
                <motion.span
                  layoutId="sidebar-active-bg"
                  className="absolute inset-0 rounded-lg bg-violet-500/15 shadow-sm shadow-violet-500/10"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              {/* Left border accent for active mode */}
              {isActive && !collapsed && (
                <motion.span
                  layoutId="sidebar-active-bar"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-violet-500"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <mode.icon
                className={cn(
                  "w-4 h-4 shrink-0 relative z-10",
                  isActive && "text-violet-400"
                )}
              />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left relative z-10">{mode.label}</span>
                  <div className="flex items-center gap-1.5 relative z-10">
                    {mode.hasContent && (
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400/70" />
                    )}
                    <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground font-mono">
                      {mode.shortcut}
                    </kbd>
                  </div>
                </>
              )}
              {collapsed && mode.hasContent && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-violet-400/70 z-10" />
              )}
            </button>
          );
        })}

        <div className="my-3 mx-2">
          <div className="h-px bg-border/50" />
        </div>

        {actions.map((action) => (
          <button
            key={action.id}
            title={collapsed ? action.label : undefined}
            onClick={() => alert(`${action.label}功能开发中`)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200",
              collapsed && "justify-center px-0"
            )}
          >
            <action.icon className="w-4 h-4 shrink-0" />
            {!collapsed && <span>{action.label}</span>}
          </button>
        ))}
      </div>

      {/* Collapse toggle — subtle */}
      <div className="p-2 border-t border-border/50">
        <button
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "展开侧栏" : "收起侧栏"}
          className="w-full h-7 flex items-center justify-center rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/30 transition-all duration-200"
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </aside>
  );
}
