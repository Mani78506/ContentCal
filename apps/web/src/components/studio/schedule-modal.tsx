"use client";

import { CalendarClock, Rocket } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useMemo, useState } from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { PlatformIcon } from "@/components/platform";
import { api, swrFetcher } from "@/lib/api";
import { designsApi } from "@/lib/studio";
import type { ContentItem, SocialAccount } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Export design → attach to a content item → schedule/publish.
 * The full pipeline: design → PNG export → content media → scheduled posts. */

export function ScheduleModal({
  open,
  onClose,
  ws,
  designId,
  designName,
  exportBlob,
}: {
  open: boolean;
  onClose: () => void;
  ws: string;
  designId: string;
  designName: string;
  exportBlob: (format: "png" | "jpeg") => Promise<Blob>;
}) {
  const router = useRouter();
  const toast = useToast();
  const { data: accounts } = useSWR<SocialAccount[]>(open ? `/api/v1/workspaces/${ws}/accounts` : null, swrFetcher);
  const { data: drafts } = useSWR<{ items: ContentItem[] }>(
    open ? `/api/v1/workspaces/${ws}/content?status=draft` : null,
    swrFetcher,
  );

  const [mode, setMode] = useState<"new" | "existing">("new");
  const [title, setTitle] = useState(designName);
  const [caption, setCaption] = useState("");
  const [existingId, setExistingId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState<"schedule" | "publish" | null>(null);

  const activeAccounts = (accounts ?? []).filter((a) => a.status === "active");
  const canSubmit = selected.size > 0 && (mode === "existing" ? !!existingId : !!title.trim());

  const minDate = useMemo(() => {
    const d = new Date(Date.now() + 5 * 60_000);
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(publishNow: boolean) {
    if (!canSubmit) return;
    if (!publishNow && !when) {
      toast.error("Pick a date and time");
      return;
    }
    setBusy(publishNow ? "publish" : "schedule");
    try {
      // 1. resolve target content
      let contentId = existingId;
      if (mode === "new") {
        const created = await api.post<ContentItem>(`/api/v1/workspaces/${ws}/content`, {
          title: title.trim(),
          caption,
          tags: ["studio"],
        });
        contentId = created.id;
      }
      // 2. export the design and attach it
      const blob = await exportBlob("png");
      await designsApi.export(ws, designId, blob, contentId);
      // 3. schedule / publish now
      await api.post(`/api/v1/workspaces/${ws}/content/${contentId}/${publishNow ? "publish-now" : "schedule"}`, {
        social_account_ids: [...selected],
        scheduled_at: publishNow ? new Date().toISOString() : new Date(when).toISOString(),
      });
      toast.success(publishNow ? "Publishing…" : "Post scheduled", "The worker will publish it at the right time.");
      onClose();
      router.push("/calendar");
    } catch (e) {
      toast.error("Couldn't schedule", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Use design in a post" width="max-w-xl">
      <div className="space-y-4">
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-slate-800">
          {(["new", "existing"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "flex-1 rounded-md py-1.5 text-sm font-medium transition-colors",
                mode === m ? "bg-white text-gray-900 shadow-sm dark:bg-slate-700 dark:text-white" : "text-gray-500 dark:text-slate-400",
              )}
            >
              {m === "new" ? "New post" : "Attach to draft"}
            </button>
          ))}
        </div>

        {mode === "new" ? (
          <>
            <div>
              <Label htmlFor="st-title">Title</Label>
              <Input id="st-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Post title" />
            </div>
            <div>
              <Label htmlFor="st-caption">Caption</Label>
              <Textarea id="st-caption" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Write your caption…" className="min-h-[80px]" />
            </div>
          </>
        ) : (
          <div>
            <Label>Draft</Label>
            <select
              value={existingId}
              onChange={(e) => setExistingId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-[#10151f] dark:text-slate-200"
            >
              <option value="">Choose a draft…</option>
              {(drafts?.items ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <Label>Platforms</Label>
          {activeAccounts.length === 0 ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
              No connected accounts yet — connect one in Accounts first.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {activeAccounts.map((a) => (
                <button
                  key={a.id}
                  onClick={() =>
                    setSelected((s) => {
                      const n = new Set(s);
                      n.has(a.id) ? n.delete(a.id) : n.add(a.id);
                      return n;
                    })
                  }
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                    selected.has(a.id)
                      ? "border-brand-400 bg-brand-50/60 dark:border-brand-500 dark:bg-brand-500/10"
                      : "border-gray-200 hover:border-gray-300 dark:border-slate-700 dark:hover:border-slate-600",
                  )}
                >
                  <PlatformIcon provider={a.provider} size="sm" />
                  <span className="min-w-0 flex-1 truncate font-medium text-gray-800 dark:text-slate-200">{a.display_name}</span>
                  {a.is_mock && <span className="text-[10px] uppercase text-gray-400">mock</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <Label htmlFor="st-when">Date & time</Label>
          <Input id="st-when" type="datetime-local" min={minDate} value={when} onChange={(e) => setWhen(e.target.value)} />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" icon={<Rocket className="h-4 w-4" />} loading={busy === "publish"} disabled={!canSubmit || !!busy} onClick={() => void submit(true)}>
            Publish now
          </Button>
          <Button icon={<CalendarClock className="h-4 w-4" />} loading={busy === "schedule"} disabled={!canSubmit || !!busy} onClick={() => void submit(false)}>
            Schedule
          </Button>
        </div>
        <p className="text-xs text-gray-400 dark:text-slate-500">
          The design is exported as PNG and attached to the post — publishing happens only via real provider APIs.
        </p>
      </div>
    </Modal>
  );
}
