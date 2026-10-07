"use client";

import { Building2, CircleCheck, CircleX, KeyRound, Server, User } from "lucide-react";
import React from "react";
import useSWR from "swr";

import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { JobList } from "@/components/jobs/job-list";
import { useApp } from "@/lib/app-context";
import { relative } from "@/lib/utils";

export default function SettingsPage() {
  const { user, workspace } = useApp();
  const { data: health } = useSWR<{ status: string }>("/health", (path: string) => fetch(path).then((r) => r.json()).catch(() => null), {
    refreshInterval: 15_000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Settings</h1>
        <p className="mt-0.5 text-sm text-gray-500">Your profile, workspace, and system status.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Profile" subtitle="How you appear to your team" />
          <div className="flex items-center gap-4 p-5">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-600 text-lg font-bold text-white">
              {user?.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
            </span>
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <User className="h-4 w-4 text-gray-400" /> {user?.full_name}
              </p>
              <p className="text-sm text-gray-500">{user?.email}</p>
              <p className="text-xs text-gray-400">Profile editing arrives with the account-settings milestone.</p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Workspace" subtitle="Current workspace details" />
          <div className="space-y-3 p-5 text-sm">
            <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
              <span className="flex items-center gap-2 text-gray-500">
                <Building2 className="h-4 w-4" /> Name
              </span>
              <span className="font-medium text-gray-900">{workspace?.name}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
              <span className="text-gray-500">Slug</span>
              <span className="font-mono text-xs text-gray-700">{workspace?.slug}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
              <span className="text-gray-500">Plan</span>
              <Badge tone="brand" className="capitalize">
                {workspace?.plan}
              </Badge>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="API status" subtitle="Live health of the backend" />
          <div className="space-y-3 p-5 text-sm">
            <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
              <span className="flex items-center gap-2 text-gray-500">
                <Server className="h-4 w-4" /> ContentCal API
              </span>
              {health?.status === "ok" ? (
                <span className="flex items-center gap-1.5 font-medium text-emerald-600">
                  <CircleCheck className="h-4 w-4" /> Operational
                </span>
              ) : (
                <span className="flex items-center gap-1.5 font-medium text-rose-600">
                  <CircleX className="h-4 w-4" /> Unreachable
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400">Checked continuously; the publishing worker status is visible on the Jobs page (calendar → failed posts).</p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Security" subtitle="How your credentials are handled" />
          <div className="space-y-3 p-5 text-sm">
            <div className="flex items-start gap-3 rounded-xl bg-gray-50 px-4 py-3">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              <div>
                <p className="font-medium text-gray-900">Session cookies — httpOnly, SameSite=Lax</p>
                <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
                  Access and refresh tokens are never stored in the browser. Platform OAuth tokens (when real
                  integrations land) are encrypted at rest with a server-side key.
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-400">
              Last sign-in {user?.last_login_at ? relative(user.last_login_at) : "—"}.
            </p>
          </div>
        </Card>

        {workspace && <JobList workspaceId={workspace.id} />}
      </div>
    </div>
  );
}
