import React from "react";

import { cn } from "@/lib/utils";

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-2xl border border-gray-200/80 bg-white shadow-soft dark:border-slate-700/60 dark:bg-[#141926]", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-slate-700/60">
      <div>
        <h3 className="text-[15px] font-semibold text-gray-900 dark:text-slate-100">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
