"use client";

import { Bell, Check, ChevronsUpDown, LogOut, Menu, Moon, Plus, Search, Sun } from "lucide-react";
import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/app-context";
import { useTheme } from "@/lib/theme";
import { cn, initials } from "@/lib/utils";

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onOutside]);
  return ref;
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, workspaces, workspace, switchWorkspace, logout } = useApp();
  const { theme, resolved, setTheme } = useTheme();
  const [wsOpen, setWsOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const wsRef = useClickOutside(() => setWsOpen(false));
  const userRef = useClickOutside(() => setUserOpen(false));
  const bellRef = useClickOutside(() => setBellOpen(false));

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-gray-200/70 bg-white/80 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-[#0b0e17]/80 sm:px-6">
      <button onClick={onMenu} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800 lg:hidden" aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>

      {/* Workspace switcher */}
      <div ref={wsRef} className="relative">
        <button
          onClick={() => setWsOpen((o) => !o)}
          className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-slate-700 dark:bg-[#141926] dark:text-slate-200 dark:hover:bg-slate-800"
          aria-haspopup="listbox"
          aria-expanded={wsOpen}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-brand-500 to-violet-600 text-[11px] font-bold text-white">
            {workspace ? initials(workspace.name) : "?"}
          </span>
          <span className="max-w-[140px] truncate">{workspace?.name ?? "No workspace"}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-gray-400" />
        </button>
        {wsOpen && (
          <div className="absolute left-0 top-full mt-2 w-64 animate-fade-up rounded-xl border border-gray-200 bg-white p-1.5 shadow-lift dark:border-slate-700 dark:bg-[#141926]" role="listbox">
            <p className="px-2.5 py-1.5 text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-slate-500">Workspaces</p>
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => {
                  switchWorkspace(ws.id);
                  setWsOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800"
                role="option"
                aria-selected={ws.id === workspace?.id}
              >
                <span className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gray-100 text-[11px] font-bold text-gray-600 dark:bg-slate-800 dark:text-slate-300">
                    {initials(ws.name)}
                  </span>
                  {ws.name}
                </span>
                {ws.id === workspace?.id && <Check className="h-4 w-4 text-brand-600" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative hidden flex-1 sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          placeholder="Search content…"
          onKeyDown={(e) => {
            if (e.key === "Enter") window.location.href = "/content";
          }}
          className="h-10 w-full max-w-md rounded-xl border border-gray-200 bg-gray-50/60 pl-9 pr-3 text-sm placeholder:text-gray-400 transition-all focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-800"
          aria-label="Search content"
        />
      </div>
      <div className="flex-1 sm:hidden" />

      <Link href="/content/new">
        <Button size="sm" icon={<Plus className="h-4 w-4" />}>
          <span className="hidden sm:inline">Create</span>
        </Button>
      </Link>

      {/* Theme toggle */}
      <button
        onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
        className="rounded-xl p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800"
        aria-label="Toggle theme"
        title={`Theme: ${theme}`}
      >
        {resolved === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>

      {/* Notifications */}
      <div ref={bellRef} className="relative">
        <button
          onClick={() => setBellOpen((o) => !o)}
          className="relative rounded-xl p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
        </button>
        {bellOpen && (
          <div className="absolute right-0 top-full mt-2 w-72 animate-fade-up rounded-xl border border-gray-200 bg-white p-4 shadow-lift dark:border-slate-700 dark:bg-[#141926]">
            <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">Notifications</p>
            <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">
              Publishing alerts and team mentions will appear here once the notifications service is enabled.
            </p>
          </div>
        )}
      </div>

      {/* User menu */}
      <div ref={userRef} className="relative">
        <button
          onClick={() => setUserOpen((o) => !o)}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-600 text-[13px] font-bold text-white shadow-sm transition-transform hover:scale-105",
          )}
          aria-label="Account menu"
        >
          {user ? initials(user.full_name) : "?"}
        </button>
        {userOpen && (
          <div className="absolute right-0 top-full mt-2 w-56 animate-fade-up rounded-xl border border-gray-200 bg-white p-1.5 shadow-lift dark:border-slate-700 dark:bg-[#141926]">
            <div className="border-b border-gray-100 px-3 py-2.5 dark:border-slate-700/60">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{user?.full_name}</p>
              <p className="truncate text-xs text-gray-500 dark:text-slate-400">{user?.email}</p>
            </div>
            <Link href="/settings" onClick={() => setUserOpen(false)} className="mt-1 block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800">
              Settings
            </Link>
            <button onClick={() => void logout()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
