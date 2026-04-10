"use client";

import { useState, useEffect, useRef, type ComponentType } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CanvasMode } from "@/components/layout/Sidebar";

function CanvasSkeleton({ label }: { label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col"
    >
      {/* Skeleton shimmer rows */}
      <div className="flex-1 p-8 space-y-4 overflow-hidden">
        {/* Title skeleton */}
        <div className="h-8 w-64 rounded-lg bg-muted/40 animate-pulse" />
        <div className="h-px bg-border/20 my-2" />
        {/* Content skeletons */}
        {[0.9, 0.7, 0.8, 0.5, 0.75, 0.6].map((w, i) => (
          <div
            key={i}
            className="h-4 rounded bg-muted/30 animate-pulse"
            style={{
              width: `${w * 100}%`,
              animationDelay: `${i * 80}ms`,
            }}
          />
        ))}
        <div className="h-px bg-border/20 my-2" />
        {[0.85, 0.6, 0.7].map((w, i) => (
          <div
            key={i + 10}
            className="h-4 rounded bg-muted/30 animate-pulse"
            style={{
              width: `${w * 100}%`,
              animationDelay: `${(i + 6) * 80}ms`,
            }}
          />
        ))}
      </div>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="flex flex-col items-center gap-3 bg-background/80 backdrop-blur-sm px-6 py-4 rounded-xl border border-border/30">
          <div className="w-7 h-7 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
      </div>
    </motion.div>
  );
}

// Lazy loader that handles SSR gracefully
function useLazyComponent<T>(
  loader: () => Promise<{ [key: string]: T }>,
  exportName: string
) {
  const [Component, setComponent] = useState<T | null>(null);
  useEffect(() => {
    loader()
      .then((mod) => setComponent(() => (mod as any)[exportName]))
      .catch((err) => console.error("Failed to load component:", err));
  }, []);
  return Component;
}

interface CanvasAreaProps {
  mode: CanvasMode;
}

const modeLabels: Record<CanvasMode, string> = {
  outline: "大纲",
  mindmap: "导图",
  whiteboard: "白板",
  template: "模板",
};

const loadingLabels: Record<CanvasMode, string> = {
  outline: "加载大纲编辑器...",
  mindmap: "加载思维导图...",
  whiteboard: "加载白板...",
  template: "加载模板...",
};

export function CanvasArea({ mode }: CanvasAreaProps) {
  const OutlineEditor = useLazyComponent<ComponentType>(
    () => import("./OutlineEditor"),
    "OutlineEditor"
  );
  const MindMapEditor = useLazyComponent<ComponentType>(
    () => import("./MindMapEditor"),
    "MindMapEditor"
  );
  const WhiteboardEditor = useLazyComponent<ComponentType>(
    () => import("./WhiteboardEditor"),
    "WhiteboardEditor"
  );
  const TemplateEditor = useLazyComponent<ComponentType>(
    () => import("./TemplateEditor"),
    "TemplateEditor"
  );

  const editors: Record<CanvasMode, ComponentType | null> = {
    outline: OutlineEditor,
    mindmap: MindMapEditor,
    whiteboard: WhiteboardEditor,
    template: TemplateEditor,
  };

  const prevMode = useRef<CanvasMode>(mode);
  const modeOrder: CanvasMode[] = ["outline", "mindmap", "whiteboard", "template"];
  const direction =
    modeOrder.indexOf(mode) > modeOrder.indexOf(prevMode.current) ? 1 : -1;
  useEffect(() => { prevMode.current = mode; }, [mode]);

  const Editor = editors[mode];

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Mode indicator tabs */}
      <div className="h-10 border-b border-border/30 flex items-center px-4 gap-1 shrink-0 bg-background/40">
        {(Object.entries(modeLabels) as [CanvasMode, string][]).map(([id, label]) => (
          <span
            key={id}
            className={`text-xs px-3 py-1 rounded-md transition-colors relative ${
              mode === id
                ? "bg-violet-500/15 text-violet-300 font-medium"
                : "text-muted-foreground"
            }`}
          >
            {label}
            {mode === id && (
              <motion.span
                layoutId="canvas-tab-indicator"
                className="absolute inset-0 rounded-md bg-violet-500/15"
                style={{ zIndex: -1 }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
          </span>
        ))}
      </div>

      {/* Canvas content with animated transitions */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={mode}
            custom={direction}
            initial={{ opacity: 0, x: direction * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -24 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="absolute inset-0 flex flex-col"
          >
            {Editor ? (
              <Editor />
            ) : (
              <div className="relative flex-1">
                <CanvasSkeleton label={loadingLabels[mode]} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
