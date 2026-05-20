"use client";

import { useEffect, useState } from "react";
import { Mic, Monitor, MicVocal } from "lucide-react";

export type AudioSourceMode = "microphone" | "system" | "mixed";

interface Props {
  mode: AudioSourceMode;
  micDeviceId: string;
  onModeChange: (m: AudioSourceMode) => void;
  onMicDeviceChange: (id: string) => void;
}

export function AudioSourcePicker({ mode, micDeviceId, onModeChange, onMicDeviceChange }: Props) {
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    navigator.mediaDevices
      .enumerateDevices()
      .then((devs) => setMicDevices(devs.filter((d) => d.kind === "audioinput")))
      .catch(() => {});

    const handler = () => {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devs) => setMicDevices(devs.filter((d) => d.kind === "audioinput")))
        .catch(() => {});
    };
    navigator.mediaDevices.addEventListener("devicechange", handler);
    return () => navigator.mediaDevices.removeEventListener("devicechange", handler);
  }, []);

  const options: { value: AudioSourceMode; label: string; hint: string; Icon: React.ElementType }[] = [
    { value: "microphone", label: "麦克风", hint: "仅录制麦克风输入", Icon: Mic },
    {
      value: "system",
      label: "系统音频",
      hint: "仅录制电脑内部声音（需分享标签页）",
      Icon: Monitor,
    },
    {
      value: "mixed",
      label: "混合",
      hint: "同时录麦克风 + 系统声音",
      Icon: MicVocal,
    },
  ];

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground font-medium">录音通道</p>
      <div className="grid grid-cols-3 gap-2">
        {options.map(({ value, label, hint, Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => onModeChange(value)}
            className={`flex flex-col items-center gap-1 px-3 py-2.5 rounded-lg border text-xs transition-all ${
              mode === value
                ? "border-violet-500/60 bg-violet-500/10 text-violet-300"
                : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="font-medium">{label}</span>
            <span className="text-[10px] leading-tight text-center opacity-70">{hint}</span>
          </button>
        ))}
      </div>

      {(mode === "microphone" || mode === "mixed") && micDevices.length > 1 && (
        <select
          value={micDeviceId}
          onChange={(e) => onMicDeviceChange(e.target.value)}
          className="mt-1 w-full text-xs px-2 py-1.5 rounded bg-muted/60 border border-border/40 outline-none"
        >
          <option value="">默认麦克风</option>
          {micDevices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `麦克风 ${d.deviceId.slice(0, 6)}`}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
