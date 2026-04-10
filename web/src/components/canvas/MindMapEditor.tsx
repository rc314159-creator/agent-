"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { useProject } from "@/hooks/useProject";
import { useWorkspace } from "@/hooks/useWorkspace";

const darkThemeConfig = {
  backgroundColor: "#0d0d14",
  lineColor: "#6d28d9",
  lineWidth: 2,
  lineStyle: "curve",
  root: {
    shape: "rectangle",
    fillColor: "#7c3aed",
    fontFamily: "system-ui, sans-serif",
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "bold",
    fontStyle: "normal",
    borderColor: "#a78bfa",
    borderWidth: 0,
    borderRadius: 8,
    borderDasharray: "none",
  },
  second: {
    shape: "rectangle",
    marginX: 100,
    marginY: 40,
    fillColor: "#1e1b4b",
    fontFamily: "system-ui, sans-serif",
    color: "#c4b5fd",
    fontSize: 14,
    fontWeight: "bold",
    fontStyle: "normal",
    borderColor: "#4c1d95",
    borderWidth: 1,
    borderRadius: 6,
    borderDasharray: "none",
  },
  node: {
    shape: "rectangle",
    marginX: 80,
    marginY: 20,
    fillColor: "#13111c",
    fontFamily: "system-ui, sans-serif",
    color: "#a78bfa",
    fontSize: 13,
    fontWeight: "normal",
    fontStyle: "normal",
    borderColor: "#2e1065",
    borderWidth: 1,
    borderRadius: 4,
    borderDasharray: "none",
  },
};

export function MindMapEditor() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mindMapRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const { currentProject, saveField } = useProject();
  const { setMindmapText } = useWorkspace();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  useEffect(() => {
    let instance: any = null;

    async function init() {
      if (!containerRef.current) return;

      const initialData = currentProject?.mindmap ?? { data: { text: "新主题" }, children: [] };

      try {
        const mod = await import("simple-mind-map");
        const MindMap = (mod as any).default ?? mod;
        instance = new (MindMap as any)({
          el: containerRef.current,
          data: initialData,
          theme: "default",
          themeConfig: darkThemeConfig,
          layout: "logicalStructure",
          mouseScaleCenterUseMousePosition: true,
          enableFreeDrag: false,
          isShowExpandNum: false,
          initRootNodePosition: ["center", "center"],
          expandBtnStyle: {
            color: "#a78bfa",
            fill: "#1e1e2e",
            fontSize: 12,
            strokeColor: "#a78bfa",
          },
          nodeTextEditZIndex: 1000,
        });
        mindMapRef.current = instance;

        // Listen to data changes for persistence
        unmountedRef.current = false;
        instance.on("data_change", (data: unknown) => {
          if (unmountedRef.current) return; // Skip saves during/after unmount
          // Extract text labels for workspace context
          function extractText(node: any): string[] {
            const texts: string[] = [];
            if (node?.data?.text) texts.push(node.data.text);
            if (Array.isArray(node?.children)) {
              node.children.forEach((c: any) => texts.push(...extractText(c)));
            }
            return texts;
          }
          const allText = extractText(data).join(", ");
          setMindmapText(allText);

          // Debounced save to project
          if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = setTimeout(() => {
            if (!unmountedRef.current) saveField("mindmap", data);
          }, 500);
        });

        // Auto-fit after layout settles
        setTimeout(() => {
          try { instance.view?.fit(); } catch {}
        }, 300);
        setReady(true);
      } catch (err) {
        console.error("Failed to load mind map:", err);
      }
    }

    init();

    return () => {
      unmountedRef.current = true;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (instance) {
        try {
          instance.destroy();
        } catch {}
      }
    };
  // Re-initialize when project switches (currentProject?.meta?.id changes)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.meta?.id]);

  const handleZoomIn = () => mindMapRef.current?.view?.enlarge();
  const handleZoomOut = () => mindMapRef.current?.view?.narrow();
  const handleFit = () => mindMapRef.current?.view?.fit();

  return (
    <div className="h-full relative bg-[#0d0d14]">
      <div ref={containerRef} className="w-full h-full" />

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-background/80 backdrop-blur-sm rounded-lg border border-border/50 p-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleZoomIn}
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleZoomOut}
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleFit}
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Help text */}
      {ready && (
        <div className="absolute top-3 left-3 text-[10px] text-muted-foreground/50 bg-background/50 backdrop-blur-sm px-2 py-1 rounded">
          双击节点编辑 · Tab 添加子节点 · Enter 添加同级
        </div>
      )}
    </div>
  );
}
