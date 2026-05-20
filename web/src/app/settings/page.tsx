"use client";

import { useEffect, useState } from "react";
import { Settings, Save, Wifi, CheckCircle, XCircle, Loader2, Mic, Bot, Fingerprint } from "lucide-react";

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

const MODELS = [
  "claude-sonnet-4-5-20250929",
  "claude-opus-4-7-20250929",
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6",
  "claude-opus-4-7",
];

type PingStatus = "idle" | "loading" | "ok" | "error";

function StatusIcon({ status }: { status: PingStatus }) {
  if (status === "loading") return <Loader2 className="w-3.5 h-3.5 animate-spin" />;
  if (status === "ok") return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />;
  if (status === "error") return <XCircle className="w-3.5 h-3.5 text-red-400" />;
  return <Wifi className="w-3.5 h-3.5" />;
}

export default function SettingsPage() {
  // ASR block
  const [asrKey, setAsrKey] = useState("");
  const [asrKeyChanged, setAsrKeyChanged] = useState(false);
  const [asrKeySaved, setAsrKeySaved] = useState(false);
  const [asrUrl, setAsrUrl] = useState("wss://dashscope.aliyuncs.com/api-ws/v1/inference");
  const [asrSaving, setAsrSaving] = useState(false);
  const [asrPing, setAsrPing] = useState<PingStatus>("idle");
  const [asrPingMsg, setAsrPingMsg] = useState("");

  // Agent block
  const [agentKey, setAgentKey] = useState("");
  const [agentKeyChanged, setAgentKeyChanged] = useState(false);
  const [agentKeySaved, setAgentKeySaved] = useState(false);
  const [agentBaseUrl, setAgentBaseUrl] = useState("https://api.anthropic.com");
  const [agentModel, setAgentModel] = useState("claude-sonnet-4-5-20250929");
  const [agentSystemPrompt, setAgentSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [providerIdx, setProviderIdx] = useState(0);
  const [customUrl, setCustomUrl] = useState("");
  const [agentSaving, setAgentSaving] = useState(false);
  const [agentPing, setAgentPing] = useState<PingStatus>("idle");
  const [agentPingMsg, setAgentPingMsg] = useState("");

  // Voiceprint block
  const [vpUrl, setVpUrl] = useState("http://localhost:4929");
  const [vpSaving, setVpSaving] = useState(false);
  const [vpPing, setVpPing] = useState<PingStatus>("idle");
  const [vpPingMsg, setVpPingMsg] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d: { settings: Record<string, string> }) => {
        const s = d.settings ?? {};
        if (s.asr_api_key || s.dashscope_api_key) setAsrKeySaved(true);
        if (s.asr_ws_url) setAsrUrl(s.asr_ws_url);

        // agent_api_key new key, fallback anthropic_api_key
        if (s.agent_api_key || s.anthropic_api_key) setAgentKeySaved(true);
        // agent_base_url new key, fallback anthropic_base_url
        const storedBase = s.agent_base_url ?? s.anthropic_base_url;
        if (storedBase) {
          const stripV1 = (u: string) => u.replace(/\/v1\/?$/, "").replace(/\/+$/, "");
          const stored = stripV1(storedBase);
          const idx = PROVIDERS.findIndex((p) => p.baseUrl && stripV1(p.baseUrl) === stored);
          if (idx >= 0) {
            setProviderIdx(idx);
            setAgentBaseUrl(PROVIDERS[idx].baseUrl);
          } else {
            setProviderIdx(2);
            setCustomUrl(storedBase);
            setAgentBaseUrl(storedBase);
          }
        }
        if (s.agent_model ?? s.anthropic_model) setAgentModel((s.agent_model ?? s.anthropic_model)!);
        if (s.agent_system_prompt) setAgentSystemPrompt(s.agent_system_prompt);
        if (s.voiceprint_url) setVpUrl(s.voiceprint_url);
      });
  }, []);

  function handleProviderChange(idx: number) {
    setProviderIdx(idx);
    if (idx !== 2) setAgentBaseUrl(PROVIDERS[idx].baseUrl);
    else setAgentBaseUrl(customUrl);
  }

  async function saveAsr() {
    setAsrSaving(true);
    const payload: Record<string, string> = { asr_ws_url: asrUrl };
    if (asrKeyChanged && asrKey) payload.asr_api_key = asrKey;
    await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (asrKeyChanged && asrKey) { setAsrKeySaved(true); setAsrKeyChanged(false); setAsrKey(""); }
    setAsrSaving(false);
  }

  async function pingAsr() {
    setAsrPing("loading");
    setAsrPingMsg("");
    try {
      const r = await fetch("/api/asr/ping", { method: "POST" });
      const d = await r.json() as { ok: boolean; latencyMs?: number; error?: string };
      if (d.ok) {
        setAsrPing("ok");
        setAsrPingMsg(`连接成功${d.latencyMs ? `，延迟 ${d.latencyMs}ms` : ""}`);
      } else {
        setAsrPing("error");
        setAsrPingMsg(d.error ?? "未知错误");
      }
    } catch (e) {
      setAsrPing("error");
      setAsrPingMsg(String(e));
    }
  }

  async function saveAgent() {
    setAgentSaving(true);
    const payload: Record<string, string> = {
      agent_base_url: agentBaseUrl,
      agent_model: agentModel,
      agent_system_prompt: agentSystemPrompt,
    };
    if (agentKeyChanged && agentKey) payload.agent_api_key = agentKey;
    await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (agentKeyChanged && agentKey) { setAgentKeySaved(true); setAgentKeyChanged(false); setAgentKey(""); }
    setAgentSaving(false);
  }

  async function pingAgent() {
    setAgentPing("loading");
    setAgentPingMsg("");
    try {
      const r = await fetch("/api/agent/ping", { method: "POST" });
      const d = await r.json() as { ok: boolean; reply?: string; error?: string };
      if (d.ok) {
        setAgentPing("ok");
        setAgentPingMsg(`连接成功，模型回复：${d.reply}`);
      } else {
        setAgentPing("error");
        setAgentPingMsg(d.error ?? "未知错误");
      }
    } catch (e) {
      setAgentPing("error");
      setAgentPingMsg(String(e));
    }
  }

  async function saveVp() {
    setVpSaving(true);
    await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voiceprint_url: vpUrl }) });
    setVpSaving(false);
  }

  async function pingVp() {
    setVpPing("loading");
    setVpPingMsg("");
    try {
      const r = await fetch("/api/voiceprint-health");
      const d = await r.json() as { ok?: boolean; status?: string; error?: string };
      if (r.ok && (d.ok === true || d.status === "ok")) {
        setVpPing("ok");
        setVpPingMsg("声纹服务正常");
      } else {
        setVpPing("error");
        setVpPingMsg(d.error ?? `HTTP ${r.status}`);
      }
    } catch (e) {
      setVpPing("error");
      setVpPingMsg(String(e));
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <div className="flex items-center gap-2 mb-2">
        <Settings className="w-5 h-5 text-violet-400" />
        <h1 className="text-lg font-semibold">设置</h1>
      </div>

      {/* ASR block */}
      <section className="space-y-4 rounded-lg border border-border/40 p-4">
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-violet-400" />
          <h2 className="text-sm font-medium">语音识别 (ASR)</h2>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            DashScope API Key
            {asrKeySaved && !asrKeyChanged && <span className="ml-2 text-emerald-400">已配置</span>}
          </label>
          <input
            type="password"
            value={asrKey}
            onChange={(e) => { setAsrKey(e.target.value); setAsrKeyChanged(true); }}
            placeholder={asrKeySaved ? "输入新 key 以替换（留空保持不变）" : "sk-..."}
            className="w-full px-3 py-2 text-sm rounded-md border border-border/40 bg-background focus:outline-none focus:ring-1 focus:ring-violet-500/50"
          />
          <p className="text-xs text-muted-foreground">若留空，使用环境变量 DASHSCOPE_API_KEY</p>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">WebSocket URL</label>
          <input
            value={asrUrl}
            onChange={(e) => setAsrUrl(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-md border border-border/40 bg-background focus:outline-none focus:ring-1 focus:ring-violet-500/50"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={saveAsr}
            disabled={asrSaving}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-colors"
          >
            {asrSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            保存 ASR 配置
          </button>
          <button
            onClick={pingAsr}
            disabled={asrPing === "loading"}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border/40 hover:bg-muted/40 disabled:opacity-50 transition-colors"
          >
            <StatusIcon status={asrPing} />
            测试连接
          </button>
        </div>
        {asrPingMsg && (
          <p className={`text-xs ${asrPing === "ok" ? "text-emerald-400" : "text-red-400"}`}>{asrPingMsg}</p>
        )}
      </section>

      {/* Agent block */}
      <section className="space-y-4 rounded-lg border border-border/40 p-4">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-violet-400" />
          <h2 className="text-sm font-medium">AI 问答 (Agent)</h2>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            API Key
            {agentKeySaved && !agentKeyChanged && <span className="ml-2 text-emerald-400">已配置</span>}
          </label>
          <input
            type="password"
            value={agentKey}
            onChange={(e) => { setAgentKey(e.target.value); setAgentKeyChanged(true); }}
            placeholder={agentKeySaved ? "输入新 key 以替换（留空保持不变）" : "sk-..."}
            className="w-full px-3 py-2 text-sm rounded-md border border-border/40 bg-background focus:outline-none focus:ring-1 focus:ring-violet-500/50"
          />
        </div>

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
              onChange={(e) => { setCustomUrl(e.target.value); setAgentBaseUrl(e.target.value); }}
              placeholder="https://your-proxy.example.com"
              className="w-full mt-2 px-3 py-2 text-sm rounded-md border border-border/40 bg-background focus:outline-none focus:ring-1 focus:ring-violet-500/50"
            />
          )}
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">模型</label>
          <select
            value={agentModel}
            onChange={(e) => setAgentModel(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-md border border-border/40 bg-background focus:outline-none focus:ring-1 focus:ring-violet-500/50"
          >
            {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">System Prompt</label>
          <textarea
            value={agentSystemPrompt}
            onChange={(e) => setAgentSystemPrompt(e.target.value)}
            rows={8}
            className="w-full px-3 py-2 text-sm rounded-md border border-border/40 bg-background focus:outline-none focus:ring-1 focus:ring-violet-500/50 font-mono resize-y"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={saveAgent}
            disabled={agentSaving}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-colors"
          >
            {agentSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            保存 Agent 配置
          </button>
          <button
            onClick={pingAgent}
            disabled={agentPing === "loading" || (!agentKey && !agentKeySaved)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border/40 hover:bg-muted/40 disabled:opacity-50 transition-colors"
          >
            <StatusIcon status={agentPing} />
            测试连通性
          </button>
        </div>
        {agentPingMsg && (
          <p className={`text-xs ${agentPing === "ok" ? "text-emerald-400" : "text-red-400"}`}>{agentPingMsg}</p>
        )}
      </section>

      {/* Voiceprint block */}
      <section className="space-y-4 rounded-lg border border-border/40 p-4">
        <div className="flex items-center gap-2">
          <Fingerprint className="w-4 h-4 text-violet-400" />
          <h2 className="text-sm font-medium">声纹服务 (Voiceprint)</h2>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">服务 URL</label>
          <input
            value={vpUrl}
            onChange={(e) => setVpUrl(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-md border border-border/40 bg-background focus:outline-none focus:ring-1 focus:ring-violet-500/50"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={saveVp}
            disabled={vpSaving}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-colors"
          >
            {vpSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            保存
          </button>
          <button
            onClick={pingVp}
            disabled={vpPing === "loading"}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border/40 hover:bg-muted/40 disabled:opacity-50 transition-colors"
          >
            <StatusIcon status={vpPing} />
            测试声纹服务
          </button>
        </div>
        {vpPingMsg && (
          <p className={`text-xs ${vpPing === "ok" ? "text-emerald-400" : "text-red-400"}`}>{vpPingMsg}</p>
        )}
      </section>
    </div>
  );
}
