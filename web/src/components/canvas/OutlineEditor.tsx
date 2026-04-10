"use client";

import { useRef, useEffect, useCallback } from "react";
import { useProject } from "@/hooks/useProject";
import { useWorkspace } from "@/hooks/useWorkspace";

export function OutlineEditor() {
  const editorRef = useRef<HTMLDivElement>(null);
  const { currentProject, saveField, renameProject, currentProjectId } = useProject();
  const { setOutlineHTML } = useWorkspace();
  // Track whether we've done the initial load to avoid overwriting user edits
  const initializedRef = useRef(false);
  // Track whether AI has already renamed this project
  const autoNamedRef = useRef(false);
  // Debounce timer for AI naming
  const aiNameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved outline when project changes
  useEffect(() => {
    if (!editorRef.current) return;
    initializedRef.current = false;
    autoNamedRef.current = false;
    const savedHTML = currentProject?.outline;
    editorRef.current.innerHTML = savedHTML || "";
    // Sync to workspace on load
    setOutlineHTML(editorRef.current.innerHTML);
    initializedRef.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.meta?.id]);

  const triggerAINaming = useCallback(
    async (text: string, projectId: string) => {
      if (!text.trim() || autoNamedRef.current) return;
      autoNamedRef.current = true;
      try {
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stream: false,
            messages: [
              {
                role: "user",
                content: `根据以下内容生成一个简短的项目名称（5字以内），只返回名称文字：\n${text}`,
              },
            ],
          }),
        });
        const data = await res.json();
        const name = data?.choices?.[0]?.message?.content?.trim();
        if (name) {
          await renameProject(projectId, name);
        }
      } catch {
        // silent fail — AI naming is best-effort
      }
    },
    [renameProject]
  );

  // Track the latest HTML for flush-on-unmount
  const latestHTMLRef = useRef<string>("");
  const dirtyRef = useRef(false);

  // Flush save immediately when component unmounts (mode switch)
  useEffect(() => {
    return () => {
      if (dirtyRef.current && latestHTMLRef.current && currentProjectId) {
        // Bypass debounce — save immediately on unmount
        fetch(`/api/projects/${currentProjectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ outline: latestHTMLRef.current }),
        }).catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId]);

  const handleInput = () => {
    if (!editorRef.current || !initializedRef.current) return;
    const html = editorRef.current.innerHTML;
    latestHTMLRef.current = html;
    dirtyRef.current = true;
    setOutlineHTML(html);
    saveField("outline", html);

    // AI auto-naming: only on first meaningful input, debounced 3s
    if (!autoNamedRef.current && currentProjectId) {
      const text = editorRef.current.innerText || "";
      if (text.trim().length > 0) {
        if (aiNameTimerRef.current) clearTimeout(aiNameTimerRef.current);
        const idAtInput = currentProjectId;
        aiNameTimerRef.current = setTimeout(() => {
          const currentText = editorRef.current?.innerText || "";
          triggerAINaming(currentText, idAtInput);
        }, 3000);
      }
    }
  };

  return (
    <div className="h-full overflow-auto">
      <style jsx global>{`
        .outline-editor h1 {
          font-size: 1.75rem;
          font-weight: 700;
          margin-bottom: 1rem;
          color: var(--foreground);
          border-bottom: 1px solid hsl(var(--border) / 0.3);
          padding-bottom: 0.5rem;
        }
        .outline-editor h2 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
          color: var(--foreground);
        }
        .outline-editor p {
          margin-bottom: 0.5rem;
          line-height: 1.75;
          color: hsl(var(--foreground) / 0.85);
        }
        .outline-editor ul, .outline-editor ol {
          padding-left: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .outline-editor li {
          margin-bottom: 0.35rem;
          line-height: 1.75;
          color: hsl(var(--foreground) / 0.85);
        }
        .outline-editor ul li {
          list-style-type: disc;
        }
        .outline-editor ol li {
          list-style-type: decimal;
        }
        .outline-editor strong {
          color: #a78bfa;
          font-weight: 600;
        }
        .outline-editor table {
          width: 100%;
          border-collapse: collapse;
          margin: 0.75rem 0;
          font-size: 0.875rem;
        }
        .outline-editor th {
          background: hsl(var(--muted));
          padding: 0.5rem 0.75rem;
          text-align: left;
          font-weight: 600;
          border: 1px solid hsl(var(--border) / 0.5);
          font-size: 0.8rem;
        }
        .outline-editor td {
          padding: 0.5rem 0.75rem;
          border: 1px solid hsl(var(--border) / 0.3);
          color: hsl(var(--foreground) / 0.8);
        }
        .outline-editor tr:hover td {
          background: hsl(var(--muted) / 0.3);
        }
        .outline-editor [contenteditable]:focus {
          outline: none;
        }
        .outline-editor-placeholder:empty::before {
          content: attr(data-placeholder);
          color: hsl(var(--muted-foreground) / 0.4);
          pointer-events: none;
        }
      `}</style>
      <div className="max-w-3xl mx-auto py-8 px-6">
        <div
          ref={editorRef}
          className="outline-editor outline-editor-placeholder text-sm leading-relaxed focus:outline-none min-h-[80vh]"
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          spellCheck={false}
          data-placeholder="开始输入内容，AI 将自动为项目命名…"
        />
      </div>
    </div>
  );
}
