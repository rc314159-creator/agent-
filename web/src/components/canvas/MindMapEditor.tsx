"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";

const defaultData = {
  data: { text: "智能协作助手", expand: true },
  children: [
    {
      data: { text: "用户需求", expand: true },
      children: [
        { data: { text: "多平台切换成本高" }, children: [] },
        { data: { text: "移动端体验差" }, children: [] },
        { data: { text: "学习成本过高" }, children: [] },
      ],
    },
    {
      data: { text: "产品定位", expand: true },
      children: [
        { data: { text: "Z世代职场人" }, children: [] },
        { data: { text: "轻量化+移动优先" }, children: [] },
        { data: { text: "AI增强" }, children: [] },
      ],
    },
    {
      data: { text: "竞品分析", expand: true },
      children: [
        { data: { text: "飞书 — 功能全但重" }, children: [] },
        { data: { text: "Notion — 学习成本高" }, children: [] },
        { data: { text: "钉钉 — 偏管理工具" }, children: [] },
      ],
    },
    {
      data: { text: "商业模式", expand: true },
      children: [
        { data: { text: "Freemium" }, children: [] },
        { data: { text: "AI功能付费" }, children: [] },
        { data: { text: "企业版定制" }, children: [] },
      ],
    },
  ],
};

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

  useEffect(() => {
    let instance: any = null;

    async function init() {
      if (!containerRef.current) return;

      try {
        const mod = await import("simple-mind-map");
        const MindMap = (mod as any).default ?? mod;
        instance = new (MindMap as any)({
          el: containerRef.current,
          data: defaultData,
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
      if (instance) {
        try {
          instance.destroy();
        } catch {}
      }
    };
  }, []);

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
