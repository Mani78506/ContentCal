"use client";

import { Activity as ActivityIcon, Filter } from "lucide-react";
import React, { useState } from "react";
import useSWR from "swr";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { activityApi } from "@/lib/studio";
import { useApp } from "@/lib/app-context";
import { cn, fullDate, initials, relative } from "@/lib/utils";
import type { ActivityItem } from "@/lib/types";

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  template_created: { label: "Template created", color: "violet" },
  template_edited: { label: "Template edited", color: "violet" },
  template_opened: { label: "Template opened", color: "gray" },
  design_created: { label: "Design created", color: "brand" },
  design_saved: { label: "Design saved", color: "brand" },
  design_exported: { label: "Design exported", color: "brand" },
  design_version_restored: { label: "Version restored", color: "brand" },
  media_uploaded: { label: "Media uploaded", color: "blue" },
  asset_deleted: { label: "Asset deleted", color: "gray" },
  brand_kit_created: { label: "Brand kit created", color: "amber" },
  brand_asset_uploaded: { label: "Brand asset", color: "amber" },
  post_created: { label: "Post created", color: "green" },
  post_edited: { label: "Post edited", color: "green" },
  post_scheduled: { label: "Post scheduled", color: "green" },
  post_rescheduled: { label: "Post rescheduled", color: "green" },
  post_cancelled: { label: "Post cancelled", color: "gray" },
  publish_started: { label: "Publishing started", color: "blue" },
  publish_succeeded: { label: "Published", color: "green" },
  publish_failed: { label: "Publish failed", color: "rose" },
};

const FILTERS = [
  { key: "", label: "All activity" },
  { key: "post_scheduled", label: "Scheduled" },
  { key: "publish_succeeded", label: "Published" },
  { key: "publish_failed", label: "Failed" },
  { key: "media_uploaded", label: "Uploads" },
  { key: "design_saved", label: "Designs" },
  { key: "template_created", label: "Templates" },
];

export default function ActivityPage() {
  const { workspace } = useApp();
  const ws = workspace?.id;
  const [action, setAction] = useState("");
  const { data, isLoading } = useSWR(ws ? `activity:${ws}:${action}` : null, () => activityApi.list(ws!, action || undefined));

  if (!workspace) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-slate-100">Activity</h1>
        <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">
          Everything that happened in {workspace.name} — newest first.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setAction(f.key)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
              action === f.key
                ? "bg-brand-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <EmptyState icon={<ActivityIcon />} title="No activity yet" description="Actions in this workspace will appear here." />
      ) : (
        <Card className="divide-y divide-gray-100 dark:divide-slate-800">
          {data.items.map((a) => {
            const meta = ACTION_LABELS[a.action] ?? { label: a.action.replace(/_/g, " "), color: "gray" };
            return (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-600 text-[11px] font-bold text-white">
                  {a.user_name ? initials(a.user_name) : "·"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800 dark:text-slate-200">
                    <span className="font-medium">{a.user_name ?? "System"}</span>{" "}
                    <span className="text-gray-500 dark:text-slate-400">{meta.label.toLowerCase()}</span>
                    {a.entity_name && (
                      <>
                        {" "}
                        <span className="font-medium">“{a.entity_name}”</span>
                      </>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400 dark:text-slate-500" title={fullDate(a.created_at)}>
                    {relative(a.created_at)}
                    {typeof a.details?.scheduled_at === "string" && ` · for ${fullDate(a.details.scheduled_at)}`}
                    {typeof a.details?.error === "string" && ` · ${a.details.error}`}
                  </p>
                </div>
                <Badge tone={meta.color as never}>{meta.label}</Badge>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
