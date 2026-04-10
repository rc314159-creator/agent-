"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Zap, User, BarChart3, Target, Map, Grid3X3 } from "lucide-react";

type TemplateId = "swot" | "persona" | "competitive" | "priority" | "journey" | "canvas";

const templates = [
  {
    id: "swot" as TemplateId,
    name: "SWOT 分析",
    description: "优势、劣势、机会、威胁四象限分析",
    gradient: "from-blue-600/30 via-blue-500/20 to-cyan-500/20",
    borderColor: "border-blue-500/30",
    iconBg: "bg-blue-500/20",
    textColor: "text-blue-400",
    icon: Zap,
  },
  {
    id: "persona" as TemplateId,
    name: "用户画像",
    description: "目标用户的特征、需求、痛点描述",
    gradient: "from-pink-600/30 via-pink-500/20 to-rose-500/20",
    borderColor: "border-pink-500/30",
    iconBg: "bg-pink-500/20",
    textColor: "text-pink-400",
    icon: User,
  },
  {
    id: "competitive" as TemplateId,
    name: "竞品分析",
    description: "竞品对比表格，维度化分析",
    gradient: "from-amber-600/30 via-amber-500/20 to-yellow-500/20",
    borderColor: "border-amber-500/30",
    iconBg: "bg-amber-500/20",
    textColor: "text-amber-400",
    icon: BarChart3,
  },
  {
    id: "priority" as TemplateId,
    name: "需求优先级",
    description: "重要性-紧急度矩阵",
    gradient: "from-green-600/30 via-green-500/20 to-emerald-500/20",
    borderColor: "border-green-500/30",
    iconBg: "bg-green-500/20",
    textColor: "text-green-400",
    icon: Target,
  },
  {
    id: "journey" as TemplateId,
    name: "用户旅程",
    description: "用户从认知到留存的完整路径",
    gradient: "from-violet-600/30 via-violet-500/20 to-purple-500/20",
    borderColor: "border-violet-500/30",
    iconBg: "bg-violet-500/20",
    textColor: "text-violet-400",
    icon: Map,
  },
  {
    id: "canvas" as TemplateId,
    name: "商业画布",
    description: "Business Model Canvas 九宫格",
    gradient: "from-indigo-600/30 via-indigo-500/20 to-blue-500/20",
    borderColor: "border-indigo-500/30",
    iconBg: "bg-indigo-500/20",
    textColor: "text-indigo-400",
    icon: Grid3X3,
  },
];

function EditableCell({ label, defaultValue, className = "" }: { label: string; defaultValue: string; className?: string }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">{label}</span>
      <div
        contentEditable
        suppressContentEditableWarning
        className="text-sm text-foreground/90 leading-relaxed outline-none focus:ring-1 focus:ring-violet-500/40 rounded px-1 py-0.5 min-h-[40px] cursor-text"
      >
        {defaultValue}
      </div>
    </div>
  );
}

function SwotTemplate() {
  const quadrants = [
    { key: "S", label: "优势 Strengths", color: "border-blue-500/40 bg-blue-500/5", labelColor: "text-blue-400", content: "轻量化设计，移动优先\nAI 功能集成\n低学习成本" },
    { key: "W", label: "劣势 Weaknesses", color: "border-red-500/40 bg-red-500/5", labelColor: "text-red-400", content: "品牌知名度低\n生态系统尚未完善\n企业级功能欠缺" },
    { key: "O", label: "机会 Opportunities", color: "border-green-500/40 bg-green-500/5", labelColor: "text-green-400", content: "Z 世代职场人群快速增长\n协作工具市场高速扩张\nAI 功能差异化空间大" },
    { key: "T", label: "威胁 Threats", color: "border-amber-500/40 bg-amber-500/5", labelColor: "text-amber-400", content: "飞书、Notion 竞争激烈\n头部产品持续迭代\n用户迁移成本高" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 h-full">
      {quadrants.map((q) => (
        <div key={q.key} className={`border rounded-xl p-4 flex flex-col gap-2 ${q.color}`}>
          <div className={`text-xs font-bold ${q.labelColor}`}>{q.label}</div>
          <div
            contentEditable
            suppressContentEditableWarning
            className="flex-1 text-sm text-foreground/80 leading-relaxed outline-none focus:ring-1 focus:ring-violet-500/40 rounded px-1 py-0.5 cursor-text whitespace-pre-wrap"
          >
            {q.content}
          </div>
        </div>
      ))}
    </div>
  );
}

function PersonaTemplate() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="rounded-2xl border border-border/40 bg-card/30 overflow-hidden">
        <div className="bg-gradient-to-r from-pink-500/20 to-rose-500/10 px-6 py-4 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-pink-500/20 border border-pink-500/30 flex items-center justify-center text-2xl">
            👩‍💼
          </div>
          <div className="flex-1">
            <div
              contentEditable
              suppressContentEditableWarning
              className="text-lg font-bold text-foreground outline-none focus:ring-1 focus:ring-pink-500/40 rounded px-1"
            >
              李晓敏
            </div>
            <div
              contentEditable
              suppressContentEditableWarning
              className="text-sm text-muted-foreground outline-none focus:ring-1 focus:ring-pink-500/40 rounded px-1 mt-0.5"
            >
              产品经理 · 互联网公司
            </div>
          </div>
        </div>
        <div className="p-6 grid grid-cols-2 gap-4">
          <EditableCell label="年龄" defaultValue="26 岁" />
          <EditableCell label="城市" defaultValue="上海" />
          <EditableCell label="职位" defaultValue="初级产品经理，工作 2 年" />
          <EditableCell label="收入" defaultValue="月薪 18K，注重性价比" />
          <EditableCell
            label="痛点"
            defaultValue="每天要在飞书、Notion、石墨间切换，会议记录整理耗时，信息孤岛严重"
            className="col-span-2"
          />
          <EditableCell
            label="目标"
            defaultValue="希望有一个轻量、AI 辅助的协作工具，减少重复劳动，提升产出效率"
            className="col-span-2"
          />
          <EditableCell
            label="使用场景"
            defaultValue="团队头脑风暴、会议记录、需求整理、周报汇总"
            className="col-span-2"
          />
        </div>
      </div>
    </div>
  );
}

function CompetitiveTemplate() {
  const headers = ["产品", "核心功能", "定价", "优势", "劣势"];
  const rows = [
    ["飞书", "IM + 文档 + 会议", "免费 / 企业付费", "生态完整，集成度高", "学习曲线陡，移动端重"],
    ["Notion", "文档 + 数据库", "$8/月", "灵活强大，模板丰富", "上手复杂，协作略慢"],
    ["钉钉", "IM + OA + 审批", "免费 / 企业付费", "国内普及率高", "偏管理向，体验老旧"],
    ["Midflow", "AI 协作 + 轻文档", "Freemium", "AI 增强，移动优先", "生态待建设"],
  ];

  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider border-b border-border/40 bg-muted/20"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              className={`border-b border-border/20 ${ri === rows.length - 1 ? "bg-violet-500/5" : "hover:bg-muted/10"} transition-colors`}
            >
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2.5">
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    className={`outline-none focus:ring-1 focus:ring-violet-500/40 rounded px-1 cursor-text ${
                      ri === rows.length - 1 ? "text-violet-300 font-medium" : "text-foreground/80"
                    }`}
                  >
                    {cell}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PriorityTemplate() {
  const quadrants = [
    { label: "重要且紧急", sublabel: "立即执行", color: "border-red-500/40 bg-red-500/5", labelColor: "text-red-400", content: "MVP 核心功能开发\n群面工具上线前最后测试\n关键 bug 修复" },
    { label: "重要不紧急", sublabel: "规划排期", color: "border-blue-500/40 bg-blue-500/5", labelColor: "text-blue-400", content: "AI 对话真实 API 接入\n数据持久化方案\n多人协作功能设计" },
    { label: "紧急不重要", sublabel: "委派处理", color: "border-amber-500/40 bg-amber-500/5", labelColor: "text-amber-400", content: "UI 微调和动画优化\n文案校对\n截图素材准备" },
    { label: "不重要不紧急", sublabel: "暂时搁置", color: "border-muted-foreground/30 bg-muted/5", labelColor: "text-muted-foreground", content: "国际化支持\n深色/浅色主题切换\n插件系统设计" },
  ];

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center justify-center gap-6 text-[10px] text-muted-foreground/60 font-medium uppercase tracking-widest shrink-0 pt-1">
        <span>← 紧急</span>
        <span>不紧急 →</span>
      </div>
      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-3">
        {quadrants.map((q) => (
          <div key={q.label} className={`border rounded-xl p-4 flex flex-col gap-2 ${q.color}`}>
            <div className="flex items-baseline justify-between">
              <span className={`text-xs font-bold ${q.labelColor}`}>{q.label}</span>
              <span className="text-[10px] text-muted-foreground/50">{q.sublabel}</span>
            </div>
            <div
              contentEditable
              suppressContentEditableWarning
              className="flex-1 text-sm text-foreground/80 leading-relaxed outline-none focus:ring-1 focus:ring-violet-500/40 rounded px-1 py-0.5 cursor-text whitespace-pre-wrap"
            >
              {q.content}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground/60 font-medium uppercase tracking-widest shrink-0 pb-1 px-2">
        <span>↑ 重要</span>
        <span>不重要 ↓</span>
      </div>
    </div>
  );
}

function JourneyTemplate() {
  const stages = [
    { name: "认知", emoji: "👀", color: "border-sky-500/40 bg-sky-500/5", labelColor: "text-sky-400", touchpoint: "社交媒体广告\n朋友推荐\n技术博客文章", emotion: "好奇", pain: "不了解产品价值" },
    { name: "考虑", emoji: "🤔", color: "border-violet-500/40 bg-violet-500/5", labelColor: "text-violet-400", touchpoint: "官网体验\n对比竞品\n查看评测视频", emotion: "期待但犹豫", pain: "担心迁移成本高" },
    { name: "决策", emoji: "✅", color: "border-green-500/40 bg-green-500/5", labelColor: "text-green-400", touchpoint: "免费试用\n团队试用反馈\n价格对比", emotion: "理性权衡", pain: "需要说服团队" },
    { name: "使用", emoji: "🚀", color: "border-amber-500/40 bg-amber-500/5", labelColor: "text-amber-400", touchpoint: "新手引导\n首次会议记录\nAI 功能体验", emotion: "兴奋 → 适应", pain: "功能学习曲线" },
    { name: "推荐", emoji: "💜", color: "border-pink-500/40 bg-pink-500/5", labelColor: "text-pink-400", touchpoint: "分享使用心得\n团队内推广\n社区反馈", emotion: "满意认同", pain: "缺少分享激励" },
  ];

  return (
    <div className="h-full overflow-auto">
      <div className="flex gap-2 min-w-[900px] h-full p-1">
        {stages.map((s, i) => (
          <div key={s.name} className={`flex-1 border rounded-xl p-3 flex flex-col gap-3 ${s.color} relative`}>
            {i < stages.length - 1 && (
              <div className="absolute right-[-10px] top-1/2 -translate-y-1/2 text-muted-foreground/30 text-lg z-10">→</div>
            )}
            <div className="text-center shrink-0">
              <div className="text-xl mb-1">{s.emoji}</div>
              <div className={`text-xs font-bold ${s.labelColor}`}>{s.name}</div>
            </div>
            <EditableCell label="触点" defaultValue={s.touchpoint} />
            <EditableCell label="情绪" defaultValue={s.emotion} />
            <EditableCell label="痛点" defaultValue={s.pain} />
          </div>
        ))}
      </div>
    </div>
  );
}

function BusinessCanvasTemplate() {
  const cells = {
    partners: { label: "关键伙伴", content: "云服务商（阿里云）\nAI 模型供应商\n开源社区" },
    activities: { label: "关键活动", content: "产品开发迭代\nAI 模型优化\n用户增长运营" },
    resources: { label: "核心资源", content: "技术团队\nAI 算法能力\n用户数据积累" },
    value: { label: "价值主张", content: "AI 增强的轻量协作工具\n一站式会议记录+分析\n降低信息整理成本 70%" },
    relations: { label: "客户关系", content: "社区驱动\n自助服务 + AI 助手\n用户反馈闭环" },
    channels: { label: "渠道通路", content: "官网直达\n应用商店\n社交媒体传播\nKOL 合作" },
    segments: { label: "客户细分", content: "Z 世代职场新人\n小型创业团队\n自由职业者" },
    costs: { label: "成本结构", content: "服务器和 AI API 调用费\n研发人员薪酬\n市场推广费用" },
    revenue: { label: "收入来源", content: "Freemium 订阅制\n团队版增值功能\nAPI 开放平台分成" },
  };

  return (
    <div className="h-full overflow-auto">
      <div className="grid grid-cols-10 grid-rows-6 gap-2 min-h-[500px] p-1" style={{ minWidth: 800 }}>
        {/* Row 1-2 left: Partners */}
        <div className="col-span-2 row-span-3 border border-indigo-500/30 bg-indigo-500/5 rounded-xl p-3 flex flex-col gap-1">
          <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">{cells.partners.label}</span>
          <div contentEditable suppressContentEditableWarning className="flex-1 text-xs text-foreground/80 leading-relaxed outline-none focus:ring-1 focus:ring-violet-500/40 rounded px-1 cursor-text whitespace-pre-wrap">{cells.partners.content}</div>
        </div>
        {/* Activities + Resources stacked */}
        <div className="col-span-2 row-span-3 flex flex-col gap-2">
          <div className="flex-1 border border-blue-500/30 bg-blue-500/5 rounded-xl p-3 flex flex-col gap-1">
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">{cells.activities.label}</span>
            <div contentEditable suppressContentEditableWarning className="flex-1 text-xs text-foreground/80 leading-relaxed outline-none focus:ring-1 focus:ring-violet-500/40 rounded px-1 cursor-text whitespace-pre-wrap">{cells.activities.content}</div>
          </div>
          <div className="flex-1 border border-cyan-500/30 bg-cyan-500/5 rounded-xl p-3 flex flex-col gap-1">
            <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">{cells.resources.label}</span>
            <div contentEditable suppressContentEditableWarning className="flex-1 text-xs text-foreground/80 leading-relaxed outline-none focus:ring-1 focus:ring-violet-500/40 rounded px-1 cursor-text whitespace-pre-wrap">{cells.resources.content}</div>
          </div>
        </div>
        {/* Center: Value Proposition */}
        <div className="col-span-2 row-span-3 border-2 border-violet-500/40 bg-violet-500/5 rounded-xl p-3 flex flex-col gap-1">
          <span className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">{cells.value.label}</span>
          <div contentEditable suppressContentEditableWarning className="flex-1 text-sm text-foreground/90 leading-relaxed outline-none focus:ring-1 focus:ring-violet-500/40 rounded px-1 cursor-text whitespace-pre-wrap font-medium">{cells.value.content}</div>
        </div>
        {/* Relations + Channels stacked */}
        <div className="col-span-2 row-span-3 flex flex-col gap-2">
          <div className="flex-1 border border-pink-500/30 bg-pink-500/5 rounded-xl p-3 flex flex-col gap-1">
            <span className="text-[10px] font-bold text-pink-400 uppercase tracking-wider">{cells.relations.label}</span>
            <div contentEditable suppressContentEditableWarning className="flex-1 text-xs text-foreground/80 leading-relaxed outline-none focus:ring-1 focus:ring-violet-500/40 rounded px-1 cursor-text whitespace-pre-wrap">{cells.relations.content}</div>
          </div>
          <div className="flex-1 border border-rose-500/30 bg-rose-500/5 rounded-xl p-3 flex flex-col gap-1">
            <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">{cells.channels.label}</span>
            <div contentEditable suppressContentEditableWarning className="flex-1 text-xs text-foreground/80 leading-relaxed outline-none focus:ring-1 focus:ring-violet-500/40 rounded px-1 cursor-text whitespace-pre-wrap">{cells.channels.content}</div>
          </div>
        </div>
        {/* Segments */}
        <div className="col-span-2 row-span-3 border border-emerald-500/30 bg-emerald-500/5 rounded-xl p-3 flex flex-col gap-1">
          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">{cells.segments.label}</span>
          <div contentEditable suppressContentEditableWarning className="flex-1 text-xs text-foreground/80 leading-relaxed outline-none focus:ring-1 focus:ring-violet-500/40 rounded px-1 cursor-text whitespace-pre-wrap">{cells.segments.content}</div>
        </div>
        {/* Bottom: Costs */}
        <div className="col-span-5 row-span-3 border border-red-500/30 bg-red-500/5 rounded-xl p-3 flex flex-col gap-1">
          <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">{cells.costs.label}</span>
          <div contentEditable suppressContentEditableWarning className="flex-1 text-xs text-foreground/80 leading-relaxed outline-none focus:ring-1 focus:ring-violet-500/40 rounded px-1 cursor-text whitespace-pre-wrap">{cells.costs.content}</div>
        </div>
        {/* Bottom: Revenue */}
        <div className="col-span-5 row-span-3 border border-green-500/30 bg-green-500/5 rounded-xl p-3 flex flex-col gap-1">
          <span className="text-[10px] font-bold text-green-400 uppercase tracking-wider">{cells.revenue.label}</span>
          <div contentEditable suppressContentEditableWarning className="flex-1 text-xs text-foreground/80 leading-relaxed outline-none focus:ring-1 focus:ring-violet-500/40 rounded px-1 cursor-text whitespace-pre-wrap">{cells.revenue.content}</div>
        </div>
      </div>
    </div>
  );
}

function TemplateEditView({ templateId, templateName, onBack }: { templateId: TemplateId; templateName: string; onBack: () => void }) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border/30 bg-background/40 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={onBack}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          返回模板列表
        </Button>
        <div className="w-px h-4 bg-border/40" />
        <span className="text-sm font-medium">{templateName}</span>
      </div>
      <div className="flex-1 overflow-auto p-5">
        {templateId === "swot" && <SwotTemplate />}
        {templateId === "persona" && <PersonaTemplate />}
        {templateId === "competitive" && <CompetitiveTemplate />}
        {templateId === "priority" && <PriorityTemplate />}
        {templateId === "journey" && <JourneyTemplate />}
        {templateId === "canvas" && <BusinessCanvasTemplate />}
      </div>
    </div>
  );
}

export function TemplateEditor() {
  const [activeTemplate, setActiveTemplate] = useState<TemplateId | null>(null);

  if (activeTemplate) {
    const tpl = templates.find((t) => t.id === activeTemplate)!;
    return (
      <TemplateEditView
        templateId={activeTemplate}
        templateName={tpl.name}
        onBack={() => setActiveTemplate(null)}
      />
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h2 className="text-lg font-semibold">选择模板</h2>
          <p className="text-sm text-muted-foreground mt-1">
            点击模板快速创建结构化的分析框架
          </p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((tpl) => {
            const Icon = tpl.icon;
            return (
              <Card
                key={tpl.id}
                onClick={() => setActiveTemplate(tpl.id)}
                className={`p-5 cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 border ${tpl.borderColor} hover:border-opacity-60 bg-gradient-to-br ${tpl.gradient} group overflow-hidden relative`}
              >
                <div
                  className={`w-12 h-12 rounded-xl ${tpl.iconBg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200`}
                >
                  <Icon className={`w-6 h-6 ${tpl.textColor}`} />
                </div>
                <h3 className="font-semibold text-sm text-foreground">{tpl.name}</h3>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                  {tpl.description}
                </p>
                <div className={`absolute bottom-0 right-0 w-24 h-24 rounded-full ${tpl.iconBg} blur-2xl opacity-40 translate-x-8 translate-y-8`} />
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
