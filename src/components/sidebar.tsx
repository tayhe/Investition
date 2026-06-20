"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  ArrowLeftRight,
  BarChart3,
  Settings,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "仪表盘", icon: LayoutDashboard },
  { href: "/portfolio", label: "持仓管理", icon: Briefcase },
  { href: "/transactions", label: "交易记录", icon: ArrowLeftRight },
  { href: "/analytics", label: "复盘分析", icon: BarChart3 },
  { href: "/settings", label: "设置", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-default bg-card h-screen sticky top-0 flex flex-col">
      <div className="p-6 border-b border-default">
        <Link href="/" className="flex items-center gap-2">
          <TrendingUp className="h-6 w-6" />
          <span className="text-lg font-bold">Investition</span>
        </Link>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted hover:text-foreground hover:bg-accent/50"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-default">
        <div className="text-xs text-muted">
          Investition v0.1.0
        </div>
      </div>
    </aside>
  );
}
