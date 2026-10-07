"use client";

import {
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Clock,
  FileEdit,
  Link2,
  Plus,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import useSWR from "swr";

import { PlatformIcon } from "@/components/platform";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CardSkeleton, Skeleton } from "@/components/ui/skeleton";
import { swrFetcher } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import type { DashboardData } from "@/lib/types";
import { relative, smartDate } from "@/lib/utils";

function MetricCard({
  icon,
  label,
  value,
  accent,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value?: number;
  accent: string;
  loading?: boolean;
}) {
  return (
    <Card className="group p-5 transition-shadow duration-200 hover:shadow-lift">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110 ${accent}`}>
          {icon}
        </span>
      </div>
      {loading ? <Skeleton className="mt-2 h-8 w-16" /> : <p className="mt-1 text-3xl font-bold tracking-tight text-gray-900">{value ?? 0}</p>}
    </Card>
  );
}

export default function DashboardPage() {
  const { user, workspace } = useApp();
  const { data, isLoading } = useSWR<DashboardData>(
    workspace ? `/api/v1/workspaces/${workspace.id}/dashboard` : null,
    swrFetcher,
    { refreshInterval: 30_000 },
  );

  const firstName = user?.full_name.split(" ")[0] ?? "there";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Good to see you, {firstName}</h1>
        <p className="mt-1 text-sm text-gray-500">Here’s what’s happening across {workspace?.name} today.</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard
          icon={<Clock className="h-4.5 w-4.5 text-brand-600" />}
          label="Scheduled posts"
          value={data?.scheduled}
          accent="bg-brand-50"
          loading={isLoading}
        />
        <MetricCard
          icon={<CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" />}
          label="Published posts"
          value={data?.published}
          accent="bg-emerald-50"
          loading={isLoading}
        />
        <MetricCard
          icon={<FileEdit className="h-4.5 w-4.5 text-amber-600" />}
          label="Drafts"
          value={data?.drafts}
          accent="bg-amber-50"
          loading={isLoading}
        />
        <MetricCard
          icon={<Link2 className="h-4.5 w-4.5 text-violet-600" />}
          label="Connected accounts"
          value={data?.connected_accounts}
          accent="bg-violet-50"
          loading={isLoading}
        />
      </div>
      {!!data?.failed && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <XCircle className="h-4 w-4" /> {data.failed} scheduled post{data.failed > 1 ? "s" : ""} failed — check the calendar to reschedule.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        {/* Upcoming */}
        <Card>
          <CardHeader
            title="Upcoming on your calendar"
            subtitle="Next 14 days"
            action={
              <Link href="/calendar" className="text-sm font-medium text-brand-600 hover:text-brand-700">
                Open calendar
              </Link>
            }
          />
          <div className="divide-y divide-gray-50">
            {isLoading && [1, 2, 3].map((i) => <div key={i} className="px-5 py-4"><Skeleton className="h-10 w-full" /></div>)}
            {!isLoading && (data?.upcoming ?? []).length === 0 && (
              <div className="p-4">
                <EmptyState
                  icon={<CalendarPlus />}
                  title="Nothing scheduled yet"
                  description="Create a post and pick a time — it will show up here and on the calendar."
                  action={
                    <Link href="/content/new" className="text-sm font-medium text-brand-600 hover:text-brand-700">
                      Create your first post
                    </Link>
                  }
                />
              </div>
            )}
            {(data?.upcoming ?? []).map((event) => (
              <Link key={event.id} href="/calendar" className="flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-gray-50/70">
                <PlatformIcon provider={event.provider} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{event.title}</p>
                  <p className="truncate text-xs text-gray-500">{event.account_name}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <StatusBadge status={event.status} />
                  <span className="w-32 text-right text-xs font-medium text-gray-500">{smartDate(event.scheduled_at)}</span>
                </div>
              </Link>
            ))}
          </div>
        </Card>

        {/* Quick actions + recent */}
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="bg-gradient-to-br from-brand-600 to-violet-700 p-5">
              <h3 className="font-semibold text-white">Quick actions</h3>
              <div className="mt-4 grid grid-cols-1 gap-2.5">
                <Link
                  href="/content/new"
                  className="flex items-center gap-3 rounded-xl bg-white/12 px-4 py-3 text-sm font-medium text-white backdrop-blur transition-all duration-150 hover:bg-white/20"
                >
                  <Plus className="h-4 w-4" /> Create content
                </Link>
                <Link
                  href="/calendar"
                  className="flex items-center gap-3 rounded-xl bg-white/12 px-4 py-3 text-sm font-medium text-white backdrop-blur transition-all duration-150 hover:bg-white/20"
                >
                  <CalendarDays className="h-4 w-4" /> Add to calendar
                </Link>
                <Link
                  href="/accounts"
                  className="flex items-center gap-3 rounded-xl bg-white/12 px-4 py-3 text-sm font-medium text-white backdrop-blur transition-all duration-150 hover:bg-white/20"
                >
                  <Link2 className="h-4 w-4" /> Connect account
                </Link>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Recent content"
              action={
                <Link href="/content" className="text-sm font-medium text-brand-600 hover:text-brand-700">
                  View all
                </Link>
              }
            />
            <div className="divide-y divide-gray-50">
              {isLoading && [1, 2, 3].map((i) => <div key={i} className="px-5 py-4"><CardSkeleton lines={0} /></div>)}
              {!isLoading && (data?.recent_content ?? []).length === 0 && (
                <p className="px-5 py-8 text-center text-sm text-gray-500">No content yet — your drafts and posts will show up here.</p>
              )}
              {(data?.recent_content ?? []).map((item) => (
                <Link key={item.id} href={`/content/${item.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-gray-50/70">
                  <div className="flex -space-x-1.5">
                    {item.platforms.slice(0, 2).map((p) => (
                      <PlatformIcon key={p} provider={p} size="sm" />
                    ))}
                    {item.platforms.length === 0 && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-gray-100 text-gray-400">
                        <FileEdit className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{item.title}</p>
                    <p className="text-xs text-gray-500">edited {relative(item.updated_at)}</p>
                  </div>
                  <StatusBadge status={item.status} />
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
