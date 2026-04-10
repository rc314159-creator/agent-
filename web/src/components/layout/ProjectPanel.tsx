"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FolderOpen,
  Plus,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useProject } from "@/hooks/useProject";

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
  const [newName, setNewName] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    const name = newName.trim() || `项目 ${projects.length + 1}`;
    await createProject(name);
    setNewName("");
    setShowInput(false);
  }, [newName, projects.length, createProject]);

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
            onClick={() => setShowInput(true)}
            title="新建项目"
          >
            <Plus className="w-3.5 h-3.5" />
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

      {/* New project input */}
      <AnimatePresence>
        {showInput && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-border/30 overflow-hidden"
          >
            <div className="p-2 space-y-1.5">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") setShowInput(false);
                }}
                placeholder="项目名称..."
                className="w-full text-xs bg-muted/30 border border-border/40 rounded-md px-2 py-1.5 outline-none focus:ring-1 focus:ring-violet-500/40"
              />
              <div className="flex gap-1">
                <Button
                  size="sm"
                  className="flex-1 h-6 text-[10px] bg-violet-600 hover:bg-violet-700"
                  onClick={handleCreate}
                  disabled={creating}
                >
                  {creating ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    "创建"
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[10px]"
                  onClick={() => setShowInput(false)}
                >
                  取消
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Project list */}
      <ScrollArea className="flex-1">
        <div className="p-1.5 space-y-0.5">
          {projects.length === 0 && !showInput && (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <FolderOpen className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs">暂无项目</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-xs gap-1 text-violet-400"
                onClick={() => setShowInput(true)}
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
