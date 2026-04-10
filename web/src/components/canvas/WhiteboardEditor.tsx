"use client";

import { useState, useEffect } from "react";

export function WhiteboardEditor() {
  const [ExcalidrawComp, setExcalidrawComp] = useState<any>(null);

  useEffect(() => {
    async function loadExcalidraw() {
      try {
        // Import CSS first
        await import("@excalidraw/excalidraw/index.css");
        const mod = await import("@excalidraw/excalidraw");
        setExcalidrawComp(() => mod.Excalidraw);
      } catch (err) {
        console.error("Failed to load Excalidraw:", err);
      }
    }
    loadExcalidraw();
  }, []);

  if (!ExcalidrawComp) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0d0d14]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">加载白板...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full" style={{ background: "#0d0d14" }}>
      <ExcalidrawComp
        theme="dark"
        langCode="zh-CN"
        UIOptions={{
          canvasActions: {
            loadScene: false,
            export: { saveFileToDisk: true },
          },
        }}
        initialData={{
          appState: {
            viewBackgroundColor: "#0d0d14",
            currentItemFontFamily: 1,
          },
          elements: [],
        }}
      />
    </div>
  );
}
