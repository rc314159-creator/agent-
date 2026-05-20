"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  micDeviceId: string;
  active: boolean; // only run when the pre-recording panel is open
}

export function MicrophoneTester({ micDeviceId, active }: Props) {
  const [level, setLevel] = useState(0); // 0-100
  const [silentWarning, setSilentWarning] = useState(false);
  const silentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!active) {
      setLevel(0);
      setSilentWarning(false);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      return;
    }

    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: micDeviceId ? { deviceId: { exact: micDeviceId } } : true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const ctx = new AudioContext();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        analyserRef.current = analyser;

        const buf = new Uint8Array(analyser.frequencyBinCount);
        let silentMs = 0;
        let lastFrameTime = performance.now();

        function tick() {
          if (cancelled) return;
          analyser.getByteFrequencyData(buf);
          const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
          const pct = Math.min(100, (rms / 128) * 100 * 3);
          setLevel(pct);

          const now = performance.now();
          const dt = now - lastFrameTime;
          lastFrameTime = now;

          if (pct < 3) {
            silentMs += dt;
            if (silentMs > 2000) setSilentWarning(true);
          } else {
            silentMs = 0;
            setSilentWarning(false);
          }

          rafRef.current = requestAnimationFrame(tick);
        }
        tick();
      } catch {
        /* permission denied or no mic — silently ignore */
      }
    }

    start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (silentTimerRef.current) clearTimeout(silentTimerRef.current);
    };
  }, [active, micDeviceId]);

  if (!active) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">麦克风检测</span>
        {silentWarning && (
          <span className="text-[10px] text-amber-400">未检测到声音，请检查麦克风</span>
        )}
      </div>
      <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
        <div
          className="h-full rounded-full bg-violet-500 transition-all duration-75"
          style={{ width: `${level}%` }}
        />
      </div>
    </div>
  );
}
