"use client";

import { useRef, useEffect } from "react";
import { useProject } from "@/hooks/useProject";
import { useWorkspace } from "@/hooks/useWorkspace";

const initialHTML = `<h1>产品群面讨论记录</h1>

<h2>一、核心问题分析</h2>
<p>当前协同办公领域存在以下痛点：</p>
<ul>
  <li>用户在多平台之间切换的成本过高</li>
  <li>现有解决方案（飞书/Notion）学习成本高</li>
  <li>移动端体验普遍不佳</li>
</ul>

<h2>二、产品定位</h2>
<p>面向 <strong>Z世代年轻职场人</strong> 的智能协作助手，主打：</p>
<ol>
  <li><strong>轻量化</strong> — 即开即用，零学习成本</li>
  <li><strong>移动优先</strong> — 移动端体验领先桌面端</li>
  <li><strong>AI增强</strong> — 用AI弥补轻量化的功能缺失</li>
</ol>

<h2>三、竞品分析</h2>
<table>
  <thead>
    <tr><th>产品</th><th>优势</th><th>劣势</th></tr>
  </thead>
  <tbody>
    <tr><td>飞书</td><td>功能全面、协作强</td><td>移动端体验差、过于臃肿</td></tr>
    <tr><td>Notion</td><td>灵活度高、模板丰富</td><td>学习成本高、国内访问慢</td></tr>
    <tr><td>钉钉</td><td>用户基数大</td><td>偏管理工具、年轻用户不喜欢</td></tr>
  </tbody>
</table>

<h2>四、商业模式</h2>
<p>Freemium 模式：基础版免费，高级 AI 功能付费。</p>

<h2>五、下一步行动</h2>
<ul>
  <li>☐ 完成用户画像和需求调研</li>
  <li>☐ 输出竞品分析报告</li>
  <li>☐ 确定 MVP 功能列表</li>
  <li>☐ 设计产品原型</li>
</ul>`;

export function OutlineEditor() {
  const editorRef = useRef<HTMLDivElement>(null);
  const { currentProject, saveField } = useProject();
  const { setOutlineHTML } = useWorkspace();
  // Track whether we've done the initial load to avoid overwriting user edits
  const initializedRef = useRef(false);

  // Load saved outline when project changes
  useEffect(() => {
    if (!editorRef.current) return;
    initializedRef.current = false;
    const savedHTML = currentProject?.outline;
    editorRef.current.innerHTML = savedHTML || initialHTML;
    // Sync to workspace on load
    setOutlineHTML(editorRef.current.innerHTML);
    initializedRef.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject?.meta?.id]);

  const handleInput = () => {
    if (!editorRef.current || !initializedRef.current) return;
    const html = editorRef.current.innerHTML;
    setOutlineHTML(html);
    saveField("outline", html);
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
      `}</style>
      <div className="max-w-3xl mx-auto py-8 px-6">
        <div
          ref={editorRef}
          className="outline-editor text-sm leading-relaxed focus:outline-none min-h-[80vh]"
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          spellCheck={false}
        />
      </div>
    </div>
  );
}
