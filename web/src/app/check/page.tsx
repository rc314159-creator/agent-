"use client";

/**
 * 设备检测页 — 模拟在线笔试 / 视频面试前的设备自检。
 * 一次性把会议工具依赖的所有外设和后端服务过一遍，给用户明确 PASS/FAIL。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Mic,
  Camera,
  Monitor,
  Volume2,
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Play,
  Square,
} from "lucide-react";

type Status = "idle" | "checking" | "pass" | "fail" | "warn";

interface Result {
  status: Status;
  message: string;
}

const STATUS_COLORS: Record<Status, string> = {
  idle: "text-muted-foreground border-border/40 bg-muted/20",
  checking: "text-violet-300 border-violet-500/40 bg-violet-500/10",
  pass: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
  fail: "text-red-300 border-red-500/40 bg-red-500/10",
  warn: "text-amber-300 border-amber-500/40 bg-amber-500/10",
};

function StatusBadge({ status, message }: Result) {
  const Icon =
    status === "pass" ? CheckCircle2 :
    status === "fail" ? XCircle :
    status === "warn" ? AlertTriangle :
    status === "checking" ? Loader2 :
    Activity;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border ${STATUS_COLORS[status]}`}>
      <Icon className={`w-3.5 h-3.5 ${status === "checking" ? "animate-spin" : ""}`} />
      {message}
    </span>
  );
}

export default function CheckPage() {
  // ---------- 麦克风 ----------
  const [micResult, setMicResult] = useState<Result>({ status: "idle", message: "未检测" });
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [micDeviceId, setMicDeviceId] = useState<string>("");
  const [micLevel, setMicLevel] = useState(0);
  const [micRecording, setMicRecording] = useState(false);
  const [micPlayback, setMicPlayback] = useState<string | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micRafRef = useRef<number | null>(null);
  const micRecorderRef = useRef<MediaRecorder | null>(null);
  const micChunksRef = useRef<Blob[]>([]);

  // ---------- 摄像头 ----------
  const [camResult, setCamResult] = useState<Result>({ status: "idle", message: "未检测" });
  const [camDevices, setCamDevices] = useState<MediaDeviceInfo[]>([]);
  const [camDeviceId, setCamDeviceId] = useState<string>("");
  const camStreamRef = useRef<MediaStream | null>(null);
  const camVideoRef = useRef<HTMLVideoElement | null>(null);

  // ---------- 系统音频 ----------
  const [sysResult, setSysResult] = useState<Result>({ status: "idle", message: "未检测" });
  const sysStreamRef = useRef<MediaStream | null>(null);

  // ---------- 扬声器 ----------
  const [spkResult, setSpkResult] = useState<Result>({ status: "idle", message: "未检测" });
  const spkCtxRef = useRef<AudioContext | null>(null);
  const spkOscRef = useRef<OscillatorNode | null>(null);

  // ---------- 后端服务 ----------
  const [asrResult, setAsrResult] = useState<Result>({ status: "idle", message: "未检测" });
  const [agentResult, setAgentResult] = useState<Result>({ status: "idle", message: "未检测" });
  const [vpResult, setVpResult] = useState<Result>({ status: "idle", message: "未检测" });

  // -------------------- 设备列表加载 --------------------
  const loadDevices = useCallback(async () => {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      setMicDevices(devs.filter((d) => d.kind === "audioinput"));
      setCamDevices(devs.filter((d) => d.kind === "videoinput"));
    } catch {/* ignore */}
  }, []);

  useEffect(() => {
    loadDevices();
    navigator.mediaDevices.addEventListener("devicechange", loadDevices);
    return () => navigator.mediaDevices.removeEventListener("devicechange", loadDevices);
  }, [loadDevices]);

  // -------------------- 麦克风测试 --------------------
  const startMicTest = useCallback(async () => {
    setMicResult({ status: "checking", message: "请求麦克风权限…" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: micDeviceId ? { deviceId: { exact: micDeviceId } } : true,
      });
      micStreamRef.current = stream;
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      micAnalyserRef.current = analyser;

      const buf = new Uint8Array(analyser.frequencyBinCount);
      let peak = 0;
      const loop = () => {
        analyser.getByteFrequencyData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        const rms = Math.sqrt(sum / buf.length);
        const pct = Math.min(100, Math.round((rms / 128) * 100));
        setMicLevel(pct);
        peak = Math.max(peak, pct);
        micRafRef.current = requestAnimationFrame(loop);
      };
      loop();

      // 录 5 秒
      micChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      micRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => micChunksRef.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(micChunksRef.current, { type: "audio/webm" });
        setMicPlayback(URL.createObjectURL(blob));
        if (peak < 3) {
          setMicResult({ status: "fail", message: "没听到任何声音，请检查麦克风是否被静音或权限是否正确" });
        } else if (peak < 15) {
          setMicResult({ status: "warn", message: `输入信号偏弱（峰值 ${peak}%），可以靠近麦克风再试` });
        } else {
          setMicResult({ status: "pass", message: `麦克风正常（峰值 ${peak}%），可以开始录音` });
        }
        if (micRafRef.current) cancelAnimationFrame(micRafRef.current);
        stream.getTracks().forEach((t) => t.stop());
      };
      setMicRecording(true);
      recorder.start();
      setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
        setMicRecording(false);
      }, 5000);
    } catch (e) {
      setMicResult({ status: "fail", message: `权限被拒或设备不可用: ${e instanceof Error ? e.message : String(e)}` });
    }
  }, [micDeviceId]);

  const stopMicTest = useCallback(() => {
    micRecorderRef.current?.stop();
    setMicRecording(false);
  }, []);

  // -------------------- 摄像头测试 --------------------
  const startCamTest = useCallback(async () => {
    setCamResult({ status: "checking", message: "请求摄像头权限…" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: camDeviceId ? { deviceId: { exact: camDeviceId } } : true,
      });
      camStreamRef.current = stream;
      if (camVideoRef.current) {
        camVideoRef.current.srcObject = stream;
        await camVideoRef.current.play().catch(() => {});
      }
      setCamResult({ status: "pass", message: "摄像头正常，预览中" });
    } catch (e) {
      setCamResult({ status: "fail", message: `权限被拒或设备不可用: ${e instanceof Error ? e.message : String(e)}` });
    }
  }, [camDeviceId]);

  const stopCamTest = useCallback(() => {
    camStreamRef.current?.getTracks().forEach((t) => t.stop());
    camStreamRef.current = null;
    if (camVideoRef.current) camVideoRef.current.srcObject = null;
    setCamResult({ status: "idle", message: "未检测" });
  }, []);

  // -------------------- 系统音频测试 --------------------
  const startSysTest = useCallback(async () => {
    setSysResult({ status: "checking", message: "请在浏览器弹窗里选择标签页 + 勾选「分享音频」" });
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: { echoCancellation: false, noiseSuppression: false },
      });
      stream.getVideoTracks().forEach((t) => t.stop());
      if (stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach((t) => t.stop());
        setSysResult({ status: "warn", message: "已分享标签页但**未勾选音频**，请重新分享并勾选「分享音频」" });
        return;
      }
      sysStreamRef.current = stream;
      setSysResult({ status: "pass", message: "系统音频抓取成功（已分享 tab 音频）" });
      // 5 秒后自动断
      setTimeout(() => {
        stream.getTracks().forEach((t) => t.stop());
        sysStreamRef.current = null;
      }, 5000);
    } catch (e) {
      setSysResult({ status: "fail", message: `用户取消或不支持: ${e instanceof Error ? e.message : String(e)}` });
    }
  }, []);

  // -------------------- 扬声器测试 --------------------
  const startSpkTest = useCallback(() => {
    setSpkResult({ status: "checking", message: "正在播放 440Hz 测试音 2 秒…" });
    const ctx = new AudioContext();
    spkCtxRef.current = ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 440;
    gain.gain.value = 0.2;
    osc.connect(gain).connect(ctx.destination);
    spkOscRef.current = osc;
    osc.start();
    setTimeout(() => {
      try { osc.stop(); ctx.close(); } catch {/* ignore */}
      setSpkResult({ status: "pass", message: "已播放，请人耳确认是否听到测试音" });
    }, 2000);
  }, []);

  // -------------------- 后端服务测试 --------------------
  const testAsr = useCallback(async () => {
    setAsrResult({ status: "checking", message: "测试 ASR…" });
    try {
      const r = await fetch("/api/asr/ping", { method: "POST" });
      const d = await r.json();
      if (d.ok) setAsrResult({ status: "pass", message: `连接成功${d.latencyMs ? `，延迟 ${d.latencyMs}ms` : ""}` });
      else setAsrResult({ status: "fail", message: d.error ?? "未知错误" });
    } catch (e) {
      setAsrResult({ status: "fail", message: String(e) });
    }
  }, []);

  const testAgent = useCallback(async () => {
    setAgentResult({ status: "checking", message: "测试 Agent…" });
    try {
      const r = await fetch("/api/agent/ping", { method: "POST" });
      const d = await r.json();
      if (d.ok) setAgentResult({ status: "pass", message: `连接成功，模型回复：${d.reply}` });
      else setAgentResult({ status: "fail", message: d.error ?? "未知错误" });
    } catch (e) {
      setAgentResult({ status: "fail", message: String(e) });
    }
  }, []);

  const testVp = useCallback(async () => {
    setVpResult({ status: "checking", message: "测试声纹服务…" });
    try {
      const r = await fetch("/api/voiceprint-health");
      const d = await r.json();
      if (r.ok && (d.ok === true || d.status === "ok")) {
        setVpResult({ status: "pass", message: `声纹服务正常（${d.model ?? "ECAPA"}）` });
      } else {
        setVpResult({ status: "fail", message: d.error ?? `HTTP ${r.status}` });
      }
    } catch (e) {
      setVpResult({ status: "fail", message: String(e) });
    }
  }, []);

  // -------------------- 一键全测 --------------------
  const runAllBackend = useCallback(() => {
    testAsr();
    testAgent();
    testVp();
  }, [testAsr, testAgent, testVp]);

  useEffect(() => {
    return () => {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      camStreamRef.current?.getTracks().forEach((t) => t.stop());
      sysStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (micRafRef.current) cancelAnimationFrame(micRafRef.current);
      try { spkOscRef.current?.stop(); spkCtxRef.current?.close(); } catch {/* ignore */}
    };
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Activity className="w-5 h-5 text-violet-400" />
        <h1 className="text-lg font-semibold">设备检测</h1>
        <button
          onClick={runAllBackend}
          className="ml-auto text-xs px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white"
        >
          一键测后端服务
        </button>
      </div>
      <p className="text-xs text-muted-foreground -mt-3">
        模拟在线笔试 / 视频面试前的设备自检。开始正式录音前，先把这些一一通过。
      </p>

      {/* 麦克风 */}
      <section className="rounded-lg border border-border/40 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-violet-400" />
          <h2 className="text-sm font-medium">麦克风</h2>
          <StatusBadge {...micResult} />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={micDeviceId}
            onChange={(e) => setMicDeviceId(e.target.value)}
            className="text-xs px-2 py-1.5 rounded bg-muted/60 border border-border/40 flex-1"
            disabled={micRecording}
          >
            <option value="">默认麦克风</option>
            {micDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label || `设备 ${d.deviceId.slice(0, 6)}`}</option>
            ))}
          </select>
          {!micRecording ? (
            <button onClick={startMicTest} className="text-xs px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white inline-flex items-center gap-1">
              <Play className="w-3.5 h-3.5" /> 测试 5 秒
            </button>
          ) : (
            <button onClick={stopMicTest} className="text-xs px-3 py-1.5 rounded bg-red-500/90 hover:bg-red-500 text-white inline-flex items-center gap-1">
              <Square className="w-3.5 h-3.5" /> 停止
            </button>
          )}
        </div>
        {(micRecording || micLevel > 0) && (
          <div>
            <div className="text-[10px] text-muted-foreground mb-1">输入电平 {micLevel}%</div>
            <div className="h-2 bg-muted/40 rounded overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all duration-75" style={{ width: `${micLevel}%` }} />
            </div>
          </div>
        )}
        {micPlayback && (
          <div className="space-y-1">
            <div className="text-[11px] text-muted-foreground">回放录音（确认是否能听清自己的声音）</div>
            <audio src={micPlayback} controls className="w-full h-8" />
          </div>
        )}
      </section>

      {/* 摄像头 */}
      <section className="rounded-lg border border-border/40 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-violet-400" />
          <h2 className="text-sm font-medium">摄像头</h2>
          <StatusBadge {...camResult} />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={camDeviceId}
            onChange={(e) => setCamDeviceId(e.target.value)}
            className="text-xs px-2 py-1.5 rounded bg-muted/60 border border-border/40 flex-1"
          >
            <option value="">默认摄像头</option>
            {camDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label || `设备 ${d.deviceId.slice(0, 6)}`}</option>
            ))}
          </select>
          {camResult.status !== "pass" ? (
            <button onClick={startCamTest} className="text-xs px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white inline-flex items-center gap-1">
              <Play className="w-3.5 h-3.5" /> 开启预览
            </button>
          ) : (
            <button onClick={stopCamTest} className="text-xs px-3 py-1.5 rounded bg-red-500/90 hover:bg-red-500 text-white inline-flex items-center gap-1">
              <Square className="w-3.5 h-3.5" /> 关闭
            </button>
          )}
        </div>
        <video
          ref={camVideoRef}
          autoPlay
          muted
          playsInline
          className="w-full max-h-64 bg-black/40 rounded object-contain"
          style={{ display: camResult.status === "pass" ? "block" : "none" }}
        />
      </section>

      {/* 系统音频 */}
      <section className="rounded-lg border border-border/40 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-violet-400" />
          <h2 className="text-sm font-medium">系统音频（标签页分享）</h2>
          <StatusBadge {...sysResult} />
        </div>
        <p className="text-[11px] text-muted-foreground">
          适用于带耳机时录在线会议对方声音。点击后浏览器弹窗，**选择「Chrome 标签页」+ 勾选「分享音频」**，5 秒后自动停止。
        </p>
        <button onClick={startSysTest} className="text-xs px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white inline-flex items-center gap-1">
          <Play className="w-3.5 h-3.5" /> 测试系统音频
        </button>
      </section>

      {/* 扬声器 */}
      <section className="rounded-lg border border-border/40 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-violet-400" />
          <h2 className="text-sm font-medium">扬声器 / 耳机</h2>
          <StatusBadge {...spkResult} />
        </div>
        <p className="text-[11px] text-muted-foreground">
          点击播放 2 秒 440Hz 测试音。如果听到「嘟——」就是 PASS。
        </p>
        <button onClick={startSpkTest} className="text-xs px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-white inline-flex items-center gap-1">
          <Play className="w-3.5 h-3.5" /> 播放测试音
        </button>
      </section>

      {/* 后端服务 */}
      <section className="rounded-lg border border-border/40 p-4 space-y-3">
        <h2 className="text-sm font-medium mb-2">后端服务连通性</h2>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs w-24 text-muted-foreground">语音识别 ASR</span>
            <StatusBadge {...asrResult} />
            <button onClick={testAsr} className="ml-auto text-xs px-2 py-1 rounded border border-border/40 hover:bg-muted/40">测试</button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs w-24 text-muted-foreground">AI 问答 Agent</span>
            <StatusBadge {...agentResult} />
            <button onClick={testAgent} className="ml-auto text-xs px-2 py-1 rounded border border-border/40 hover:bg-muted/40">测试</button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs w-24 text-muted-foreground">声纹服务</span>
            <StatusBadge {...vpResult} />
            <button onClick={testVp} className="ml-auto text-xs px-2 py-1 rounded border border-border/40 hover:bg-muted/40">测试</button>
          </div>
        </div>
      </section>
    </div>
  );
}
