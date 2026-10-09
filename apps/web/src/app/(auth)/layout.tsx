"use client";

import { CalendarCheck2, Moon, Sun } from "lucide-react";

import { useTheme } from "@/lib/theme";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { resolved, setTheme } = useTheme();
  return (
    <div className="grid min-h-screen bg-white text-gray-900 dark:bg-slate-950 dark:text-slate-100 lg:grid-cols-[1fr_1.1fr]">
      <button
        onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
        aria-label="Toggle theme"
        className="absolute right-5 top-5 z-20 rounded-full border border-gray-200 bg-white/80 p-2 text-gray-500 shadow-sm backdrop-blur transition-colors hover:text-gray-900 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:text-white"
      >
        {resolved === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
      <div className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md animate-fade-up">
          <div className="mb-10 flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow">
              <CalendarCheck2 className="h-5 w-5" />
            </span>
            <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">ContentCal</span>
          </div>
          {children}
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-ink lg:block">
        <div className="absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-brand-600/30 blur-3xl" />
        <div className="absolute -right-24 bottom-1/4 h-80 w-80 rounded-full bg-violet-600/25 blur-3xl" />
        <div className="relative z-10 flex h-full flex-col justify-center px-16">
          <blockquote className="max-w-lg">
            <p className="font-display text-3xl font-semibold leading-snug text-white">
              “Plan it once. Publish everywhere. Never miss a moment again.”
            </p>
            <footer className="mt-6 text-sm text-gray-400">
              ContentCal — the calm command center for creators, brands, and agencies.
            </footer>
          </blockquote>
          <ul className="mt-10 space-y-3 text-sm text-gray-300">
            {["One calendar for every platform", "Automatic publishing with retry-safe jobs", "Workspaces built for teams and clients"].map((line) => (
              <li key={line} className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
