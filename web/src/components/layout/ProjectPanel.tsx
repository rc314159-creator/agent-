"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FolderOpen,
  Plus,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Clock,
} from "lucide-react";
import { useProject } from "@/hooks/useProject";
import { toast } from "sonner";

function formatTimestamp() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `新项目 ${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export function ProjectPanel() {
  const {
    projects,
    currentProjectId,
    creating,
    createProject,
    switchProject,
    deleteProject,
  } = useProject();
  const [collapsed, setCollapsed] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    const name = formatTimestamp();
    await createProject(name);
  }, [createProject]);

  const handleDelete = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setDeletingId(id);
      await deleteProject(id);
      setDeletingId(null);
    },
    [deleteProject]
  );

  if (collapsed) {
    return (
      <div className="w-10 border-r border-border/50 bg-background/40 backdrop-blur-xl flex flex-col items-center py-3 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 mb-3"
          onClick={() => setCollapsed(false)}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
        <FolderOpen className="w-4 h-4 text-muted-foreground" />
        <span className="text-[9px] text-muted-foreground mt-1 writing-mode-vertical">
          项目
        </span>
      </div>
    );
  }

  return (
    <aside className="w-52 border-r border-border/50 bg-background/40 backdrop-blur-xl flex flex-col shrink-0">
      {/* Header */}
      <div className="h-10 border-b border-border/30 flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-1.5">
          <FolderOpen className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-xs font-medium">项目</span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => toast.info("历史记录功能开发中")}
            title="历史记录"
          >
            <Clock className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleCreate}
            disabled={creating}
            title="新建项目"
          >
            {creating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setCollapsed(true)}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Project list */}
      <ScrollArea className="flex-1">
        <div className="p-1.5 space-y-0.5">
          {projects.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <FolderOpen className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs">暂无项目</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-xs gap-1 text-violet-400"
                onClick={handleCreate}
                disabled={creating}
              >
                <Plus className="w-3 h-3" />
                新建项目
              </Button>
            </div>
          )}
          {projects.map((p) => (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => switchProject(p.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); switchProject(p.id); } }}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-all group cursor-pointer ${
                currentProjectId === p.id
                  ? "bg-violet-500/15 border border-violet-500/30 text-foreground"
                  : "hover:bg-muted/30 text-foreground/70 border border-transparent"
              }`}
            >
              <div
                className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                  currentProjectId === p.id
                    ? "bg-violet-500/20"
                    : "bg-muted/40"
                }`}
              >
                <FolderOpen
                  className={`w-3 h-3 ${
                    currentProjectId === p.id
                      ? "text-violet-400"
                      : "text-muted-foreground"
                  }`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{p.name}</p>
                <p className="text-[10px] text-muted-foreground/60">
                  {new Date(p.updatedAt).toLocaleDateString("zh-CN")}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                onClick={(e) => handleDelete(p.id, e)}
                disabled={deletingId === p.id}
              >
                {deletingId === p.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Trash2 className="w-3 h-3 text-muted-foreground hover:text-red-400" />
                )}
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </aside>
  );
}
