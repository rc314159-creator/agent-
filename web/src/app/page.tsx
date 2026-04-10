"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Header } from "@/components/layout/Header";
import { Sidebar, CanvasMode } from "@/components/layout/Sidebar";
import { ProjectPanel } from "@/components/layout/ProjectPanel";
import { CanvasArea } from "@/components/canvas/CanvasArea";
import { VoicePanel } from "@/components/voice/VoicePanel";
import { AIChatSidebar } from "@/components/ai/AIChatSidebar";
import { AIPanel } from "@/components/ai/AIPanel";
import { CopilotKitProvider } from "@/components/ai/CopilotKitProvider";
import { CopilotKitWorkspace } from "@/components/ai/CopilotKitWorkspace";
import { AIToggleProvider, useAIToggleProvider } from "@/hooks/useAIToggle";
import { ProjectProvider, useProject } from "@/hooks/useProject";
import { WorkspaceProvider } from "@/hooks/useWorkspace";
import { Button } from "@/components/ui/button";
import { MessageSquare, Keyboard, FolderOpen } from "lucide-react";

const SHORTCUT_HINTS = [
  { key: "1 – 4", desc: "切换画布模式" },
  { key: "⌘/", desc: "打开 AI 助手" },
];

function ShortcutToast() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Show once on first load, after a short delay
    const shown = sessionStorage.getItem("shortcuts-shown");
    if (!shown) {
      const t = setTimeout(() => {
        setVisible(true);
        sessionStorage.setItem("shortcuts-shown", "1");
        setTimeout(() => setVisible(false), 4000);
      }, 1200);
      return () => clearTimeout(t);
    }
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-background/90 backdrop-blur-xl border border-border/50 rounded-xl px-4 py-3 shadow-xl shadow-black/20 flex items-center gap-4"
        >
          <Keyboard className="w-4 h-4 text-violet-400 shrink-0" />
          <div className="flex items-center gap-4">
            {SHORTCUT_HINTS.map((h) => (
              <div key={h.key} className="flex items-center gap-1.5">
                <kbd className="text-[11px] px-1.5 py-0.5 rounded bg-muted/80 border border-border/60 font-mono text-foreground/70">
                  {h.key}
                </kbd>
                <span className="text-xs text-muted-foreground">{h.desc}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MeetFlowApp() {
  const [canvasMode, setCanvasMode] = useState<CanvasMode>("outline");
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [voicePanelWidth, setVoicePanelWidth] = useState(320);
  const aiToggle = useAIToggleProvider();

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      if (e.key === "1") setCanvasMode("outline");
      if (e.key === "2") setCanvasMode("mindmap");
      if (e.key === "3") setCanvasMode("whiteboard");
      if (e.key === "4") setCanvasMode("template");
      if (e.key === "/" && e.metaKey) setAiChatOpen((v) => !v);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const { currentProjectId, createProject } = useProject();

  return (
    <AIToggleProvider value={aiToggle}>
      <WorkspaceProvider>
      <CopilotKitProvider>
      <TooltipProvider>
        <motion.div
          className="h-screen flex flex-col overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <Header />
          <div className="flex-1 flex overflow-hidden">
            <ProjectPanel />
            {currentProjectId ? (
              <>
                <Sidebar activeMode={canvasMode} onModeChange={setCanvasMode} />
                <div className="flex-1 flex flex-col min-w-0">
                  <div className="flex-1 flex overflow-hidden">
                    <CanvasArea mode={canvasMode} />
                    <VoicePanel width={voicePanelWidth} onWidthChange={setVoicePanelWidth} />
                  </div>
                  <AIPanel />
                </div>
                <AIChatSidebar
                  open={aiChatOpen}
                  onClose={() => setAiChatOpen(false)}
                />
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                <FolderOpen className="w-16 h-16 mb-4 opacity-20" />
                <h2 className="text-lg font-medium text-foreground/60 mb-2">选择或创建一个项目</h2>
                <p className="text-sm mb-4">从左侧面板选择已有项目，或创建新项目开始记录</p>
                <Button
                  className="gap-2 bg-violet-600 hover:bg-violet-700"
                  onClick={() => createProject("新项目")}
                >
                  <FolderOpen className="w-4 h-4" />
                  创建新项目
                </Button>
              </div>
            )}
          </div>

          {/* Floating AI chat toggle button */}
          <AnimatePresence>
            {aiToggle.aiEnabled && !aiChatOpen && currentProjectId && (
              <motion.button
                key="ai-fab"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                transition={{ type: "spring", stiffness: 400, damping: 28 }}
                onClick={() => setAiChatOpen(true)}
                style={{ right: voicePanelWidth + 16 }}
                className="fixed bottom-6 w-12 h-12 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 shadow-lg shadow-violet-500/25 flex items-center justify-center z-50 group"
              >
                <MessageSquare className="w-5 h-5 text-white" />
                <span className="absolute -top-8 right-0 bg-background/90 backdrop-blur-sm text-xs px-2 py-1 rounded border border-border/50 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  AI 助手 (⌘/)
                </span>
              </motion.button>
            )}
          </AnimatePresence>

          <ShortcutToast />
        </motion.div>
      <CopilotKitWorkspace />
      </TooltipProvider>
      </CopilotKitProvider>
      </WorkspaceProvider>
    </AIToggleProvider>
  );
}

export default function Page() {
  return (
    <ProjectProvider>
      <MeetFlowApp />
    </ProjectProvider>
  );
}
