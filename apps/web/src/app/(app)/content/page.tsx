"use client";

import { FileText, Image as ImageIcon, Plus, Search } from "lucide-react";
import Link from "next/link";
import React, { useMemo, useState } from "react";
import useSWR from "swr";

import { PlatformIcon } from "@/components/platform";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { swrFetcher } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import type { ContentStatus, ContentSummary } from "@/lib/types";
import { cn, relative, smartDate } from "@/lib/utils";

const FILTERS: { value: ContentStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "failed", label: "Failed" },
  { value: "archived", label: "Archived" },
];

interface ListResponse {
  items: ContentSummary[];
  total: number;
}

export default function ContentPage() {
  const { workspace } = useApp();
  const [filter, setFilter] = useState<ContentStatus | "all">("all");
  const [query, setQuery] = useState("");

  const key = workspace
    ? `/api/v1/workspaces/${workspace.id}/content${filter === "all" ? "" : `?status=${filter}`}`
    : null;
  const { data, isLoading } = useSWR<ListResponse>(key, swrFetcher, { keepPreviousData: true });

  const items = useMemo(() => {
    const list = data?.items ?? [];
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter((c) => c.title.toLowerCase().includes(q));
  }, [data, query]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Content</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {data ? `${data.total} item${data.total === 1 ? "" : "s"}` : "Everything you’ve written, in one place"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by title…" className="w-56 pl-9" aria-label="Filter content by title" />
          </div>
          <Link href="/content/new">
            <Button size="md" icon={<Plus className="h-4 w-4" />}>
              New content
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Status filter">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            role="tab"
            aria-selected={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-all duration-150",
              filter === f.value
                ? "border-brand-600 bg-brand-600 text-white shadow-sm"
                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          className="bg-white"
          icon={<FileText />}
          title={query ? "Nothing matches that search" : "No content here yet"}
          description={query ? `No items titled like “${query}”.` : "Drafts, scheduled posts and published work will all live here."}
          action={
            !query && (
              <Link href="/content/new">
                <Button icon={<Plus className="h-4 w-4" />}>Write your first post</Button>
              </Link>
            )
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/content/${item.id}`}
              className="group flex flex-col rounded-2xl border border-gray-200/80 bg-white p-5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex -space-x-1.5">
                  {item.platforms.map((p) => (
                    <PlatformIcon key={p} provider={p} size="sm" />
                  ))}
                  {item.platforms.length === 0 && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-gray-100 text-gray-400">
                      <FileText className="h-3 w-3" />
                    </span>
                  )}
                </div>
                <StatusBadge status={item.status} />
              </div>
              <h3 className="mt-3 line-clamp-2 flex-1 text-[15px] font-semibold leading-snug text-gray-900 group-hover:text-brand-700">
                {item.title}
              </h3>
              <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
                {item.media.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <ImageIcon className="h-3.5 w-3.5" /> {item.media.length}
                  </span>
                )}
                <span>edited {relative(item.updated_at)}</span>
                {item.next_scheduled_at && <span className="ml-auto font-medium text-brand-600">{smartDate(item.next_scheduled_at)}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
