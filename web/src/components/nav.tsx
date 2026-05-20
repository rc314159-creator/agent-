"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mic, Users, History, Settings, Activity } from "lucide-react";

const TABS = [
  { href: "/", label: "录音", icon: Mic },
  { href: "/voiceprints", label: "声纹库", icon: Users },
  { href: "/meetings", label: "历史会议", icon: History },
  { href: "/check", label: "设备检测", icon: Activity },
  { href: "/settings", label: "设置", icon: Settings },
];

export function TopNav() {
  const path = usePathname();
  return (
    <header className="h-12 border-b border-border/40 bg-background/70 backdrop-blur-xl flex items-center px-4 gap-1 shrink-0">
      <span className="text-sm font-semibold mr-4 select-none">会议记录</span>
      <nav className="flex gap-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ${
                active
                  ? "bg-violet-500/15 text-violet-300 border border-violet-500/30"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
