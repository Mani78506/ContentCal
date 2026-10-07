"use client";

import { Cog } from "lucide-react";
import { format, parseISO } from "date-fns";
import React from "react";
import useSWR from "swr";

import { StatusBadge } from "@/components/status-badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { swrFetcher } from "@/lib/api";
import type { PublishingJob } from "@/lib/types";

interface JobsResponse {
  items: PublishingJob[];
  total: number;
}

export function JobList({ workspaceId }: { workspaceId: string }) {
  const { data, isLoading } = useSWR<JobsResponse>(`/api/v1/workspaces/${workspaceId}/jobs`, swrFetcher, {
    refreshInterval: 10_000,
  });

  return (
    <Card className="xl:col-span-2">
      <CardHeader
        title="Publishing pipeline"
        subtitle="Durable publishing jobs with full attempt history — this is what the worker executes"
      />
      {isLoading ? (
        <div className="space-y-3 p-5">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (data?.items ?? []).length === 0 ? (
        <div className="p-4">
          <EmptyState icon={<Cog />} title="No publishing jobs yet" description="Schedule or publish a post and its job will appear here with status, retries, and attempts." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                <th className="px-5 py-3">Job</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Run at</th>
                <th className="px-5 py-3">Retries</th>
                <th className="px-5 py-3">Attempts</th>
                <th className="px-5 py-3">Last error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(data?.items ?? []).map((job) => (
                <tr key={job.id} className="transition-colors hover:bg-gray-50/60">
                  <td className="px-5 py-3 font-mono text-xs text-gray-500" title={job.idempotency_key}>
                    {job.id.slice(0, 8)}…
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={job.status} />
                  </td>
                  <td className="px-5 py-3 text-gray-600">{format(parseISO(job.run_at), "MMM d, HH:mm")}</td>
                  <td className="px-5 py-3 text-gray-600">
                    {job.retry_count}/{job.max_retries}
                  </td>
                  <td className="px-5 py-3 text-gray-600">{job.attempts.length}</td>
                  <td className="max-w-[260px] truncate px-5 py-3 text-xs text-gray-400" title={job.last_error ?? undefined}>
                    {job.last_error ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
