"use client";

import {
  Activity,
  BarChart3,
  Building2,
  CalendarCheck2,
  CalendarDays,
  FileText,
  Image,
  LayoutDashboard,
  Link2,
  Palette,
  Settings,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React from "react";

import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/studio", label: "Studio", icon: Palette },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/content", label: "Content", icon: FileText },
  { href: "/media", label: "Media", icon: Image },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/accounts", label: "Accounts", icon: Link2 },
  { href: "/team", label: "Team", icon: Users },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();

  const body = (
    <nav aria-label="Primary" className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-5">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow">
            <CalendarCheck2 className="h-4.5 w-4.5" />
          </span>
          <span className="text-[17px] font-bold tracking-tight text-gray-900 dark:text-slate-100">ContentCal</span>
        </Link>
        <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 lg:hidden" aria-label="Close menu">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-2 flex-1 space-y-0.5 overflow-y-auto px-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                active
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-slate-400 dark:hover:bg-slate-800/70 dark:hover:text-slate-100",
              )}
            >
              {active && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-600" />}
              <Icon className={cn("h-[18px] w-[18px] transition-colors", active ? "text-brand-600 dark:text-brand-400" : "text-gray-400 group-hover:text-gray-600 dark:group-hover:text-slate-300")} />
              {label}
            </Link>
          );
        })}
      </div>

      <div className="border-t border-gray-100 p-4 dark:border-slate-700/60">
        <div className="flex items-center gap-2.5 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100/60 p-3 dark:from-slate-800/60 dark:to-slate-800/30">
          <Building2 className="h-4 w-4 shrink-0 text-gray-400 dark:text-slate-500" />
          <p className="text-xs leading-relaxed text-gray-500 dark:text-slate-400">
            Free plan — connect real platforms when provider APIs are enabled.
          </p>
        </div>
      </div>
    </nav>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-gray-200/70 bg-white dark:border-slate-800 dark:bg-[#10141f] lg:block">{body}</aside>
      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-40 transition-opacity duration-200 lg:hidden",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 w-72 bg-white shadow-lift transition-transform duration-200 dark:bg-[#10141f]",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {body}
        </aside>
      </div>
    </>
  );
}
