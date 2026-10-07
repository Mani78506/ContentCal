"use client";

import { FlaskConical, Link2, Lock, RefreshCcw, Unplug } from "lucide-react";
import React, { useState } from "react";
import useSWR from "swr";

import { PlatformIcon, PLATFORMS } from "@/components/platform";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { api, ApiError, swrFetcher } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import type { ProviderInfo, SocialAccount } from "@/lib/types";
import { relative } from "@/lib/utils";

export default function AccountsPage() {
  const { workspace } = useApp();
  const toast = useToast();
  const { data: accounts, isLoading, mutate } = useSWR<SocialAccount[]>(
    workspace ? `/api/v1/workspaces/${workspace.id}/accounts` : null,
    swrFetcher,
  );
  const { data: providers } = useSWR<ProviderInfo[]>(
    workspace ? `/api/v1/workspaces/${workspace.id}/accounts/providers` : null,
    swrFetcher,
  );

  const [connectOpen, setConnectOpen] = useState(false);
  const [mockName, setMockName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function connectMock() {
    if (!workspace) return;
    setBusy("connect");
    try {
      await api.post(`/api/v1/workspaces/${workspace.id}/accounts/connect`, {
        provider: "mock",
        display_name: mockName.trim() || "Mock Account",
      });
      await mutate();
      setConnectOpen(false);
      setMockName("");
      toast.success("Mock account connected", "Development account ready — scheduled posts will be simulated locally.");
    } catch (err) {
      toast.error("Connect failed", err instanceof ApiError ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  async function validate(id: string) {
    if (!workspace) return;
    setBusy(`validate-${id}`);
    try {
      await api.post(`/api/v1/workspaces/${workspace.id}/accounts/${id}/validate`);
      await mutate();
      toast.success("Account validated");
    } catch (err) {
      toast.error("Validation failed", err instanceof ApiError ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(id: string) {
    if (!workspace) return;
    setBusy(`disconnect-${id}`);
    try {
      await api.del(`/api/v1/workspaces/${workspace.id}/accounts/${id}`);
      await mutate();
      toast.info("Account disconnected");
    } catch (err) {
      toast.error("Couldn’t disconnect", err instanceof ApiError ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  const realProviders = (providers ?? []).filter((p) => !p.implemented && !p.is_mock);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Connected accounts</h1>
          <p className="mt-0.5 text-sm text-gray-500">Channels your workspace can publish to.</p>
        </div>
        <div className="ml-auto">
          <Button size="md" icon={<FlaskConical className="h-4 w-4" />} onClick={() => setConnectOpen(true)}>
            Connect dev account
          </Button>
        </div>
      </div>

      {/* Connected accounts */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-36 w-full rounded-2xl" />
          ))}
        </div>
      ) : (accounts ?? []).length === 0 ? (
        <EmptyState
          className="bg-white"
          icon={<Link2 />}
          title="No accounts connected"
          description="Connect a channel to schedule and publish content. During development you can connect a mock account that simulates publishing without touching real platforms."
          action={
            <Button icon={<FlaskConical className="h-4 w-4" />} onClick={() => setConnectOpen(true)}>
              Connect dev account
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(accounts ?? []).map((account) => (
            <Card key={account.id} className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <PlatformIcon provider={account.provider} size="lg" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{account.display_name}</p>
                    <p className="text-xs text-gray-500">{PLATFORMS[account.provider]?.label}</p>
                  </div>
                </div>
                {account.is_mock && <Badge tone="violet">dev mock</Badge>}
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
                <Badge tone={account.status === "active" ? "green" : "rose"} dot>
                  {account.status}
                </Badge>
                {account.last_validated_at && <span>checked {relative(account.last_validated_at)}</span>}
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" icon={<RefreshCcw className="h-3.5 w-3.5" />} loading={busy === `validate-${account.id}`} onClick={() => void validate(account.id)}>
                  Validate
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-rose-600 hover:bg-rose-50"
                  icon={<Unplug className="h-3.5 w-3.5" />}
                  loading={busy === `disconnect-${account.id}`}
                  onClick={() => void disconnect(account.id)}
                >
                  Disconnect
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Real providers, honestly marked unavailable */}
      <Card>
        <CardHeader
          title="Platform integrations"
          subtitle="OAuth flows for these platforms are not implemented yet. They will be enabled one by one behind the provider interface — no fake publishing."
        />
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-5">
          {realProviders.map((p) => (
            <div key={p.provider} className="flex flex-col items-center gap-2.5 rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-5 text-center">
              <PlatformIcon provider={p.provider} size="lg" className="opacity-50 grayscale" />
              <p className="text-sm font-medium text-gray-600">{p.name}</p>
              <Badge tone="gray">
                <Lock className="h-3 w-3" /> Not yet available
              </Badge>
            </div>
          ))}
        </div>
      </Card>

      {/* Connect mock modal */}
      <Modal open={connectOpen} onClose={() => setConnectOpen(false)} title="Connect a development account">
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-800">
            <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Mock accounts simulate the full publish lifecycle locally — jobs, retries, and statuses all behave exactly as they
              will with real providers, but nothing is ever posted to a real platform.
            </p>
          </div>
          <div>
            <Label htmlFor="mockName">Account display name</Label>
            <Input id="mockName" value={mockName} onChange={(e) => setMockName(e.target.value)} placeholder="e.g. Studio Test Channel" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConnectOpen(false)}>
              Cancel
            </Button>
            <Button loading={busy === "connect"} onClick={() => void connectMock()}>
              Connect
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
