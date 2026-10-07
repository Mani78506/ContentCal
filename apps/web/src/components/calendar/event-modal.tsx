"use client";

import { format } from "date-fns";
import { CalendarClock, ExternalLink, PencilLine, Trash2 } from "lucide-react";
import Link from "next/link";
import React, { useState } from "react";

import { PlatformIcon, PLATFORMS } from "@/components/platform";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import type { CalendarEvent } from "@/lib/types";
import { fullDate } from "@/lib/utils";

export function EventModal({
  event,
  workspaceId,
  onClose,
  onChanged,
}: {
  event: CalendarEvent | null;
  workspaceId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [newTime, setNewTime] = useState("");
  const [busy, setBusy] = useState<"move" | "cancel" | null>(null);

  if (!event) return null;
  const canEdit = event.status === "scheduled" || event.status === "failed";

  async function act(kind: "move" | "cancel") {
    if (!event) return;
    setBusy(kind);
    try {
      if (kind === "move") {
        const when = new Date(newTime);
        await api.patch(`/api/v1/workspaces/${workspaceId}/scheduled-posts/${event.id}`, { scheduled_at: when.toISOString() });
        toast.success("Post rescheduled", fullDate(when.toISOString()));
      } else {
        await api.post(`/api/v1/workspaces/${workspaceId}/scheduled-posts/${event.id}/cancel`);
        toast.info("Post cancelled", "It has been removed from the publishing queue.");
      }
      onChanged();
      onClose();
    } catch (err) {
      toast.error("Action failed", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open onClose={onClose} title={event.title} width="max-w-lg">
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <PlatformIcon provider={event.provider} size="lg" />
          <div>
            <p className="text-sm font-medium text-gray-900">{PLATFORMS[event.provider]?.label}</p>
            <p className="text-xs text-gray-500">{event.account_name}</p>
          </div>
          <div className="ml-auto">
            <StatusBadge status={event.status} />
          </div>
        </div>

        {event.thumbnail_path && event.thumbnail_mime?.startsWith("image/") && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.thumbnail_path} alt="Post media preview" className="max-h-56 w-full rounded-xl object-cover" />
        )}

        {event.caption_preview && (
          <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm leading-relaxed text-gray-600">{event.caption_preview}</p>
        )}

        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl border border-gray-100 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Scheduled for</p>
            <p className="mt-1 font-medium text-gray-800">{fullDate(event.scheduled_at)}</p>
          </div>
          <div className="rounded-xl border border-gray-100 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Status</p>
            <p className="mt-1 font-medium capitalize text-gray-800">{event.status}</p>
            {event.platform_post_url && (
              <a
                href={event.platform_post_url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                View post <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>

        {canEdit && (
          <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50/60 p-4">
            <Label htmlFor="reschedule" hint="local time">
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" /> Move to
              </span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="reschedule"
                type="datetime-local"
                value={newTime}
                min={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
                onChange={(e) => setNewTime(e.target.value)}
              />
              <Button variant="secondary" loading={busy === "move"} disabled={!newTime} onClick={() => void act("move")}>
                Move
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-gray-100 pt-4">
          {canEdit ? (
            <Button variant="ghost" className="text-rose-600 hover:bg-rose-50" icon={<Trash2 className="h-4 w-4" />} loading={busy === "cancel"} onClick={() => void act("cancel")}>
              Cancel post
            </Button>
          ) : (
            <span />
          )}
          <Link href={`/content/${event.content_id}`}>
            <Button variant="outline" icon={<PencilLine className="h-4 w-4" />}>
              Edit content
            </Button>
          </Link>
        </div>
      </div>
    </Modal>
  );
}
