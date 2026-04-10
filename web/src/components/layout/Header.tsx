"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sparkles,
  Settings,
  Download,
  Share2,
  Pencil,
  Check,
} from "lucide-react";
import { useAIToggle } from "@/hooks/useAIToggle";

export function Header() {
  const { aiEnabled, toggleAI } = useAIToggle();
  const [title, setTitle] = useState("智能协作助手讨论");
  const [isEditing, setIsEditing] = useState(false);

  return (
    <header className="h-14 border-b border-border/50 bg-background/80 backdrop-blur-xl flex items-center justify-between px-4 shrink-0 z-50">
      {/* Left: Logo & Title */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center animate-[logoShimmer_4s_ease-in-out_infinite] shadow-[0_0_12px_oklch(0.55_0.27_290deg/0.3)]">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-sm tracking-tight bg-gradient-to-r from-violet-300 to-indigo-300 bg-clip-text text-transparent">
            Midflow
          </span>
        </div>
        <div className="w-px h-6 bg-border/50" />
        {isEditing ? (
          <div className="flex items-center gap-1">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-7 text-sm w-72 bg-muted/50"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && setIsEditing(false)}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsEditing(false)}
              title="确认"
            >
              <Check className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors group"
            title="点击编辑标题"
          >
            <span>{title}</span>
            <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        )}
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-2">
        {/* AI Toggle */}
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-300 ${
            aiEnabled
              ? "bg-violet-500/15 border-violet-500/40 shadow-[0_0_12px_oklch(0.55_0.27_290deg/0.25)]"
              : "bg-muted/50 border-border/50"
          }`}
        >
          <Sparkles
            className={`w-3.5 h-3.5 transition-colors ${aiEnabled ? "text-violet-400" : "text-muted-foreground"}`}
          />
          <span className={`text-xs font-medium transition-colors ${aiEnabled ? "text-violet-300" : ""}`}>AI</span>
          <Switch
            checked={aiEnabled}
            onCheckedChange={toggleAI}
            className="scale-75"
          />
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="分享"
        >
          <Share2 className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="下载"
        >
          <Download className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="设置"
        >
          <Settings className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
}
