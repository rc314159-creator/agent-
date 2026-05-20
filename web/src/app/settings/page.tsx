"use client";

import { useEffect, useState } from "react";
import { Settings, Save, Wifi, CheckCircle, XCircle, Loader2 } from "lucide-react";

const DEFAULT_SYSTEM_PROMPT = `你是一个专业的会议记录分析助手。你的任务是分析会议记录，生成结构化的会议总结。
总结应包含：
1. 会议概述（时间、参与者、主要议题）
2. 关键讨论点（按话题分组）
3. 决策与结论
4. 待办事项（如有）
5. 跨会议洞察（结合历史会议记录，分析参与者的行为模式和持续关注的话题）

请用中文输出，格式清晰，使用 Markdown。`;

const PROVIDERS = [
  { label: "Anthropic 官方", baseUrl: "https://api.anthropic.com" },
  { label: "云雾中转 (yunwu.ai)", baseUrl: "https://api.yunwu.ai" },
  { label: "自定义", baseUrl: "" },
];

// Full versioned IDs required — aliases like "claude-sonnet-4-6" may fail on some proxies
const MODELS = [
  "claude-sonnet-4-5-20250929",
  "claude-opus-4-7-20250929",
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6",
  "claude-opus-4-7",
];

type PingStatus = "idle" | "loading" | "ok" | "error";

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.anthropic.com");
  const [model, setModel] = useState("claude-sonnet-4-5-20250929");
  const [dashscopeKey, setDashscopeKey] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [providerIdx, setProviderIdx] = useState(0);
  const [customUrl, setCustomUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pingStatus, setPingStatus] = useState<PingStatus>("idle");
  const [pingMsg, setPingMsg] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d: { settings: Record<string, string> }) => {
        const s = d.settings ?? {};
        if (s.anthropic_api_key) setApiKey(s.anthropic_api_key);
        if (s.anthropic_model) setModel(s.anthropic_model);
        if (s.agent_system_prompt) setSystemPrompt(s.agent_system_prompt);
        if (s.dashscope_api_key) setDashscopeKey(s.dashscope_api_key);
        if (s.anthropic_base_url) {
          const idx = PROVIDERS.findIndex((p) => p.baseUrl === s.anthropic_base_url);
          if (idx >= 0) {
            setProviderIdx(idx);
            setBaseUrl(s.anthropic_base_url);
          } else {
            setProviderIdx(2);
            setCustomUrl(s.anthropic_base_url);
            setBaseUrl(s.anthropic_base_url);
          }
        }
      });
  }, []);

  function handleProviderChange(idx: number) {
    setProviderIdx(idx);
    if (idx !== 2) setBaseUrl(PROVIDERS[idx].baseUrl);
    else setBaseUrl(customUrl);
  }

  function handleCustomUrl(v: string) {
    setCustomUrl(v);
    setBaseUrl(v);
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const payload: Record<string, string> = {
      anthropic_api_key: apiKey,
      anthropic_base_url: baseUrl,
      anthropic_model: model,
      agent_system_prompt: systemPrompt,
    };
    if (dashscopeKey) payload.dashscope_api_key = dashscopeKey;
    await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function handlePing() {
    setPingStatus("loading");
    setPingMsg("");
    try {
      const r = await fetch("/api/agent/ping", { method: "POST" });
      const d = await r.json() as { ok: boolean; reply?: string; error?: string };
      if (d.ok) {
        setPingStatus("ok");
        setPingMsg(`连接成功，模型回复：${d.reply}`);
      } else {
        setPingStatus("error");
        setPingMsg(d.error ?? "未知错误");
      }
    } catch (e) {
      setPingStatus("error");
      setPingMsg(String(e));
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <div className="flex items-center gap-2 mb-2">
        <Settings className="w-5 h-5 text-violet-400" />
        <h1 className="text-lg font-semibold">设置</h1>
      </div>

      {/* LLM section */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">大模型 API</h2>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Provider</label>
          <div className="flex gap-2 flex-wrap">
            {PROVIDERS.map((p, i) => (
              <button
                key={i}
                onClick={() => handleProviderChange(i)}
                className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                  providerIdx === i
                    ? "bg-violet-500/20 border-violet-500/50 text-violet-300"
                    : "border-border/40 text-muted-foreground hover:bg-muted/40"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {providerIdx === 2 && (
            <input
              value={customUrl}
              onChange={(e) => handleCustomUrl(e.target.value)}
              placeholder="https://your-proxy.example.com"
              className="w-full mt-2 px-3 py-2 text-sm rounded-md border border-border/40 bg-background focus:outline-none focus:ring-1 focus:ring-violet-500/50"
            />
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="w-full px-3 py-2 text-sm rounded-md border border-border/40 bg-background focus:outline-none focus:ring-1 focus:ring-violet-500/50"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">模型</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-md border border-border/40 bg-background focus:outline-none focus:ring-1 focus:ring-violet-500/50"
          >
            {MODELS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handlePing}
          disabled={pingStatus === "loading" || !apiKey}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border/40 hover:bg-muted/40 disabled:opacity-50 transition-colors"
        >
          {pingStatus === "loading" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
          测试连通性
          {pingStatus === "ok" && <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />}
          {pingStatus === "error" && <XCircle className="w-3.5 h-3.5 text-red-400" />}
        </button>
        {pingMsg && (
          <p className={`text-xs mt-1 ${pingStatus === "ok" ? "text-emerald-400" : "text-red-400"}`}>{pingMsg}</p>
        )}
      </section>

      {/* ASR section */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">ASR (语音识别)</h2>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">DashScope API Key</label>
          <input
            type="password"
            value={dashscopeKey}
            onChange={(e) => setDashscopeKey(e.target.value)}
            placeholder="sk-..."
            className="w-full px-3 py-2 text-sm rounded-md border border-border/40 bg-background focus:outline-none focus:ring-1 focus:ring-violet-500/50"
          />
          <p className="text-xs text-muted-foreground">若留空，则使用环境变量 DASHSCOPE_API_KEY</p>
        </div>
      </section>

      {/* Agent system prompt */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Agent System Prompt</h2>
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={10}
          className="w-full px-3 py-2 text-sm rounded-md border border-border/40 bg-background focus:outline-none focus:ring-1 focus:ring-violet-500/50 font-mono resize-y"
        />
      </section>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-md bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          保存设置
        </button>
        {saved && <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> 已保存</span>}
      </div>
    </div>
  );
}
