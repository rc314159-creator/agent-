"use client";

import { createContext, useContext, useState, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import React from "react";

export interface TranscriptItem {
  id: number;
  speaker: string;
  text: string;
  time: string;
}

interface WorkspaceState {
  outlineHTML: string;
  mindmapText: string;
  whiteboardText: string;
  templateText: string;
  transcripts: TranscriptItem[];
  canvasMode: string;
}

interface WorkspaceContextValue extends WorkspaceState {
  setOutlineHTML: (html: string) => void;
  setMindmapText: (text: string) => void;
  setWhiteboardText: (text: string) => void;
  setTemplateText: (text: string) => void;
  setTranscripts: (items: TranscriptItem[]) => void;
  setCanvasMode: (mode: string) => void;
  getContextSummary: () => string;
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  outlineHTML: "",
  mindmapText: "",
  whiteboardText: "",
  templateText: "",
  transcripts: [],
  canvasMode: "outline",
  setOutlineHTML: () => {},
  setMindmapText: () => {},
  setWhiteboardText: () => {},
  setTemplateText: () => {},
  setTranscripts: () => {},
  setCanvasMode: () => {},
  getContextSummary: () => "",
});

export function useWorkspace() {
  return useContext(WorkspaceContext);
}

/** Strip HTML tags to plain text */
function stripHTML(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** Truncate a string to maxLen characters */
function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + "...";
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [outlineHTML, setOutlineHTMLState] = useState("");
  const [mindmapText, setMindmapTextState] = useState("");
  const [whiteboardText, setWhiteboardTextState] = useState("");
  const [templateText, setTemplateTextState] = useState("");
  const [transcripts, setTranscriptsState] = useState<TranscriptItem[]>([]);
  const [canvasMode, setCanvasModeState] = useState("outline");

  // Use refs for getContextSummary to always read latest values without re-creating the callback
  const stateRef = useRef({ outlineHTML, mindmapText, whiteboardText, templateText, transcripts, canvasMode });
  stateRef.current = { outlineHTML, mindmapText, whiteboardText, templateText, transcripts, canvasMode };

  const setOutlineHTML = useCallback((html: string) => setOutlineHTMLState(html), []);
  const setMindmapText = useCallback((text: string) => setMindmapTextState(text), []);
  const setWhiteboardText = useCallback((text: string) => setWhiteboardTextState(text), []);
  const setTemplateText = useCallback((text: string) => setTemplateTextState(text), []);
  const setTranscripts = useCallback((items: TranscriptItem[]) => setTranscriptsState(items), []);
  const setCanvasMode = useCallback((mode: string) => setCanvasModeState(mode), []);

  const getContextSummary = useCallback((): string => {
    const { outlineHTML, mindmapText, whiteboardText, templateText, transcripts, canvasMode } = stateRef.current;
    const TOTAL_LIMIT = 4000;

    const parts: string[] = [];

    parts.push(`[当前画布模式: ${canvasMode}]`);

    const outlinePlain = stripHTML(outlineHTML);
    if (outlinePlain) {
      parts.push(`\n## 大纲内容\n${truncate(outlinePlain, 800)}`);
    }

    if (mindmapText) {
      parts.push(`\n## 思维导图\n${truncate(mindmapText, 600)}`);
    }

    if (whiteboardText) {
      parts.push(`\n## 白板文本\n${truncate(whiteboardText, 600)}`);
    }

    if (templateText) {
      parts.push(`\n## 模板内容\n${truncate(templateText, 600)}`);
    }

    if (transcripts.length > 0) {
      const recent = transcripts.slice(-30);
      const transcriptStr = recent.map((t) => `[${t.time}] ${t.speaker}: ${t.text}`).join("\n");
      parts.push(`\n## 语音转录 (最近 ${recent.length} 条)\n${truncate(transcriptStr, 1200)}`);
    }

    const summary = parts.join("\n");
    return summary.length > TOTAL_LIMIT ? summary.slice(0, TOTAL_LIMIT) + "..." : summary;
  }, []);

  const value: WorkspaceContextValue = {
    outlineHTML,
    mindmapText,
    whiteboardText,
    templateText,
    transcripts,
    canvasMode,
    setOutlineHTML,
    setMindmapText,
    setWhiteboardText,
    setTemplateText,
    setTranscripts,
    setCanvasMode,
    getContextSummary,
  };

  return React.createElement(WorkspaceContext.Provider, { value }, children);
}
