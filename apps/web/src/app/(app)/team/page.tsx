"use client";

import { Crown, Shield, UserMinus, UserPlus, Users } from "lucide-react";
import React, { useState } from "react";
import useSWR from "swr";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label, Select } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { api, ApiError, swrFetcher } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import type { Member, WorkspaceRole } from "@/lib/types";
import { initials, relative } from "@/lib/utils";

const ROLE_META: Record<WorkspaceRole, { tone: "violet" | "brand" | "blue" | "gray"; icon?: React.ReactNode }> = {
  owner: { tone: "violet", icon: <Crown className="h-3 w-3" /> },
  admin: { tone: "brand", icon: <Shield className="h-3 w-3" /> },
  member: { tone: "blue" },
  viewer: { tone: "gray" },
};

export default function TeamPage() {
  const { workspace, user } = useApp();
  const toast = useToast();
  const canManage = workspace?.role === "owner" || workspace?.role === "admin";
  const { data: members, isLoading, mutate } = useSWR<Member[]>(
    workspace ? `/api/v1/workspaces/${workspace.id}/members` : null,
    swrFetcher,
  );

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("member");
  const [busy, setBusy] = useState<string | null>(null);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace) return;
    setBusy("invite");
    try {
      await api.post(`/api/v1/workspaces/${workspace.id}/members`, { email, role });
      await mutate();
      setEmail("");
      toast.success("Member added", `${email} can now access this workspace.`);
    } catch (err) {
      toast.error("Couldn’t add member", err instanceof ApiError ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  async function remove(member: Member) {
    if (!workspace) return;
    setBusy(member.id);
    try {
      await api.del(`/api/v1/workspaces/${workspace.id}/members/${member.id}`);
      await mutate();
      toast.info("Member removed", `${member.user.full_name} no longer has access.`);
    } catch (err) {
      toast.error("Couldn’t remove member", err instanceof ApiError ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Team</h1>
        <p className="mt-0.5 text-sm text-gray-500">People who can access {workspace?.name}.</p>
      </div>

      {canManage && (
        <Card className="p-5">
          <form onSubmit={invite} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <Label htmlFor="invite-email">Invite by email</Label>
              <Input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@studio.com" />
            </div>
            <div className="w-40">
              <Label htmlFor="invite-role">Role</Label>
              <Select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as WorkspaceRole)}>
                <option value="admin">Admin</option>
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
              </Select>
            </div>
            <Button type="submit" icon={<UserPlus className="h-4 w-4" />} loading={busy === "invite"}>
              Add member
            </Button>
          </form>
          <p className="mt-2.5 text-xs text-gray-400">
            They must already have a ContentCal account — email invitations are on the roadmap.
          </p>
        </Card>
      )}

      <Card>
        <CardHeader title="Members" subtitle={members ? `${members.length} people` : undefined} />
        {isLoading ? (
          <div className="space-y-3 p-5">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (members ?? []).length === 0 ? (
          <div className="p-4">
            <EmptyState icon={<Users />} title="Just you for now" description="Invite teammates, clients, or collaborators to plan together." />
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {(members ?? []).map((member) => (
              <li key={member.id} className="flex items-center gap-3.5 px-5 py-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-600 text-sm font-bold text-white">
                  {initials(member.user.full_name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {member.user.full_name}
                    {member.user.id === user?.id && <span className="ml-1.5 text-xs font-normal text-gray-400">(you)</span>}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {member.user.email} · joined {relative(member.joined_at)}
                  </p>
                </div>
                <Badge tone={ROLE_META[member.role].tone}>
                  {ROLE_META[member.role].icon}
                  {member.role}
                </Badge>
                {canManage && member.role !== "owner" && (
                  <Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50" icon={<UserMinus className="h-4 w-4" />} loading={busy === member.id} onClick={() => void remove(member)} aria-label={`Remove ${member.user.full_name}`}>
                    <span className="sr-only">Remove</span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
