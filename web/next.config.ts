import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // React StrictMode 在 dev 时 mount 两次，导致 ws.onmessage 闭包捕获的 setState
  // 指向已卸载实例，writeLive 看似执行但 UI 不更新（R16 实测确认是录音页"看不到
  // 实时字幕"的根因）。录音页强依赖 WebSocket / AudioContext 等长生命周期闭包，
  // 关掉 StrictMode 避免双 mount 撕裂。
  reactStrictMode: false,
};

export default nextConfig;
