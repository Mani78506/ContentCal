"use client";

import { format, parseISO } from "date-fns";
import { CalendarClock, CloudUpload, Film, FolderOpen, Loader2, Rocket, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useMemo, useRef, useState } from "react";
import useSWR from "swr";

import { PlatformIcon, PLATFORMS } from "@/components/platform";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { api, ApiError, swrFetcher } from "@/lib/api";
import { libraryApi } from "@/lib/studio";
import type { ContentItem, ContentStatus, LibraryAsset, MediaItem, ScheduledPost, SocialAccount } from "@/lib/types";
import { cn, formatBytes } from "@/lib/utils";

function draftStatus(status: ContentStatus | undefined): boolean {
  return !status || status === "draft";
}

export function ContentEditor({ workspaceId, contentId }: { workspaceId: string; contentId?: string }) {
  const router = useRouter();
  const toast = useToast();

  const { data: existing, mutate } = useSWR<ContentItem>(
    contentId ? `/api/v1/workspaces/${workspaceId}/content/${contentId}` : null,
    swrFetcher,
  );
  const { data: accounts } = useSWR<SocialAccount[]>(`/api/v1/workspaces/${workspaceId}/accounts`, swrFetcher);

  const [id, setId] = useState(contentId);
  const [title, setTitle] = useState(contentId ? null : "");
  const [caption, setCaption] = useState(contentId ? null : "");
  const [tagsInput, setTagsInput] = useState<string | null>(contentId ? null : "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState<"save" | "schedule" | "publish" | "upload" | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // hydrate form when existing content arrives
  const currentTitle = title ?? existing?.title ?? "";
  const currentCaption = caption ?? existing?.caption ?? "";
  const currentTags = tagsInput ?? (existing ? (existing.tags ?? []).join(", ") : "");
  const media: MediaItem[] = existing?.media ?? [];
  const posts: ScheduledPost[] = existing?.scheduled_posts ?? [];

  const activeAccounts = (accounts ?? []).filter((a) => a.status === "active");
  const dirty = title !== null || caption !== null || tagsInput !== null;

  const scheduledAtIso = useMemo(() => {
    if (!date || !time) return null;
    return new Date(`${date}T${time}`).toISOString();
  }, [date, time]);

  async function ensureDraft(): Promise<string> {
    if (id) return id;
    const created = await api.post<ContentItem>(`/api/v1/workspaces/${workspaceId}/content`, {
      title: currentTitle.trim() || "Untitled",
      caption: currentCaption,
      tags: currentTags.split(",").map((t) => t.trim()).filter(Boolean),
    });
    setId(created.id);
    return created.id;
  }

  async function saveDraft(): Promise<string | null> {
    setBusy("save");
    try {
      const cid = id ?? (await ensureDraft());
      await api.patch(`/api/v1/workspaces/${workspaceId}/content/${cid}`, {
        title: currentTitle.trim() || "Untitled",
        caption: currentCaption,
        tags: currentTags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      setTitle(null);
      setCaption(null);
      setTagsInput(null);
      await mutate();
      toast.success("Draft saved");
      if (!contentId) router.replace(`/content/${cid}`);
      return cid;
    } catch (err) {
      toast.error("Couldn’t save", err instanceof ApiError ? err.message : "Please try again.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    if (!files.length) return;
    setBusy("upload");
    try {
      const cid = await ensureDraft();
      for (const file of Array.from(files)) {
        await api.upload(`/api/v1/workspaces/${workspaceId}/content/${cid}/media`, file);
      }
      await mutate();
      toast.success(files.length === 1 ? "Media uploaded" : `${files.length} files uploaded`);
      if (!contentId) router.replace(`/content/${cid}`);
    } catch (err) {
      toast.error("Upload failed", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function removeMedia(mediaId: string) {
    if (!id) return;
    try {
      await api.del(`/api/v1/workspaces/${workspaceId}/content/${id}/media/${mediaId}`);
      await mutate();
      toast.info("Media removed");
    } catch (err) {
      toast.error("Couldn’t remove media", err instanceof ApiError ? err.message : undefined);
    }
  }

  async function schedule(publishNow: boolean) {
    if (selected.size === 0) {
      toast.error("Pick at least one account", "Select where this post should go.");
      return;
    }
    if (!publishNow && !scheduledAtIso) {
      toast.error("Pick a date and time", "Choose when this post should go out.");
      return;
    }
    const cid = id ?? (await ensureDraft());
    setBusy(publishNow ? "publish" : "schedule");
    try {
      const endpoint = publishNow ? "publish-now" : "schedule";
      await api.post(`/api/v1/workspaces/${workspaceId}/content/${cid}/${endpoint}`, {
        social_account_ids: [...selected],
        scheduled_at: publishNow ? new Date().toISOString() : scheduledAtIso,
      });
      await mutate();
      if (publishNow) {
        toast.success("Queued for publishing", "The worker will pick it up. Watch the status change here.");
      } else {
        toast.success("Post scheduled", format(parseISO(scheduledAtIso!), "EEEE, MMM d 'at' HH:mm"));
      }
      if (!contentId) router.replace(`/content/${cid}`);
    } catch (err) {
      toast.error("Scheduling failed", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      {/* Left: content */}
      <div className="space-y-6">
        <Card className="p-5">
          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={currentTitle} onChange={(e) => setTitle(e.target.value)} placeholder="Spring collection launch teaser" maxLength={500} />
            </div>
            <div>
              <Label htmlFor="caption" hint={`${currentCaption.length} characters`}>
                Caption
              </Label>
              <Textarea
                id="caption"
                rows={8}
                value={currentCaption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Write the caption your audience will love…"
              />
            </div>
            <div>
              <Label htmlFor="tags" hint="comma separated">
                Tags
              </Label>
              <Input id="tags" value={currentTags} onChange={(e) => setTagsInput(e.target.value)} placeholder="launch, spring, behind-the-scenes" />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Media"
            subtitle="JPEG, PNG, WebP, GIF, MP4, MOV, WebM — up to 10 files"
            action={
              <Button variant="outline" size="sm" icon={<FolderOpen className="h-4 w-4" />} onClick={() => setLibraryOpen(true)}>
                From library
              </Button>
            }
          />
          <div className="p-5">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void uploadFiles(e.dataTransfer.files);
              }}
              className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center transition-colors hover:border-brand-300 hover:bg-brand-50/40"
            >
              {busy === "upload" ? (
                <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
              ) : (
                <CloudUpload className="h-8 w-8 text-gray-400" />
              )}
              <p className="mt-3 text-sm font-medium text-gray-700">Drag & drop media here</p>
              <p className="mt-0.5 text-xs text-gray-400">or</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => fileRef.current?.click()}>
                Browse files
              </Button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm" multiple hidden onChange={(e) => e.target.files && void uploadFiles(e.target.files)} />
            </div>

            {media.length > 0 && (
              <ul className="mt-4 space-y-2">
                {media.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-3 py-2.5">
                    {m.mime_type.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/media/${m.file_path}`} alt={m.file_name} className="h-10 w-10 rounded-lg object-cover" />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                        <Film className="h-5 w-5" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-800">{m.file_name}</p>
                      <p className="text-xs text-gray-400">{formatBytes(m.size_bytes)}</p>
                    </div>
                    <button onClick={() => void removeMedia(m.id)} className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${m.file_name}`}>
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      {/* Right: scheduling */}
      <div className="space-y-6">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">Status</p>
            {existing && <StatusBadge status={existing.status} />}
          </div>
          {!existing && <p className="mt-1 text-sm text-gray-500">Unsaved draft</p>}
          <div className="mt-4 grid grid-cols-1 gap-2">
            <Button variant="outline" icon={<Save className="h-4 w-4" />} loading={busy === "save"} disabled={!dirty && !!id} onClick={() => void saveDraft()}>
              Save draft
            </Button>
            <Button icon={<CalendarClock className="h-4 w-4" />} loading={busy === "schedule"} disabled={!scheduledAtIso || selected.size === 0} onClick={() => void schedule(false)}>
              Schedule post
            </Button>
            <Button variant="secondary" icon={<Rocket className="h-4 w-4" />} loading={busy === "publish"} disabled={selected.size === 0} onClick={() => void schedule(true)}>
              Publish now
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Publish to" subtitle={activeAccounts.length === 0 ? "Connect an account first" : `${activeAccounts.length} account(s) available`} />
          <div className="space-y-2 p-5 pt-4">
            {activeAccounts.map((account) => {
              const checked = selected.has(account.id);
              return (
                <button
                  key={account.id}
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => {
                    const next = new Set(selected);
                    if (next.has(account.id)) next.delete(account.id);
                    else next.add(account.id);
                    setSelected(next);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all duration-150",
                    checked ? "border-brand-400 bg-brand-50/60 ring-2 ring-brand-500/15" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50",
                  )}
                >
                  <PlatformIcon provider={account.provider} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{account.display_name}</p>
                    <p className="text-xs text-gray-400">
                      {PLATFORMS[account.provider]?.label}
                      {account.is_mock ? " · dev mock" : ""}
                    </p>
                  </div>
                  <span className={cn("flex h-5 w-5 items-center justify-center rounded-md border transition-colors", checked ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300")}>
                    {checked && (
                      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M2 6l3 3 5-6" />
                      </svg>
                    )}
                  </span>
                </button>
              );
            })}
            {activeAccounts.length === 0 && (
              <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
                No active accounts yet.{" "}
                <a href="/accounts" className="font-medium text-brand-600 hover:text-brand-700">
                  Connect one
                </a>{" "}
                to start publishing.
              </p>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" min={format(new Date(), "yyyy-MM-dd")} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="time">Time</Label>
              <Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
        </Card>

        {posts.length > 0 && (
          <Card>
            <CardHeader title="Scheduled posts" />
            <ul className="divide-y divide-gray-50">
              {posts.map((post) => (
                <li key={post.id} className="flex items-center gap-3 px-5 py-3">
                  <PlatformIcon provider={post.provider} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800">{post.account_name}</p>
                    <p className="text-xs text-gray-400">{format(parseISO(post.scheduled_at), "MMM d, HH:mm")}</p>
                  </div>
                  <StatusBadge status={post.status} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <LibraryPicker
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        workspaceId={workspaceId}
        onPick={async (assetId) => {
          const cid = id ?? (await ensureDraft());
          await libraryApi.attachToContent(workspaceId, cid, assetId);
          await mutate();
          if (!contentId) router.replace(`/content/${cid}`);
          toast.success("Attached to post");
        }}
      />
    </div>
  );
}

function LibraryPicker({
  open,
  onClose,
  workspaceId,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  onPick: (assetId: string) => Promise<void>;
}) {
  const toast = useToast();
  const [picking, setPicking] = useState<string | null>(null);
  const { data } = useSWR(open ? `lib-picker:${workspaceId}` : null, () => libraryApi.list(workspaceId));

  return (
    <Modal open={open} onClose={onClose} title="Media library" width="max-w-2xl">
      {!data ? (
        <p className="py-8 text-center text-sm text-gray-400">Loading…</p>
      ) : data.items.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">
          Library is empty — upload files on the{" "}
          <a href="/media" className="text-brand-600 hover:underline">Media</a> page or inside the Studio.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {data.items.map((a) => (
            <button
              key={a.id}
              disabled={picking === a.id}
              onClick={async () => {
                setPicking(a.id);
                try {
                  await onPick(a.id);
                  onClose();
                } catch (e) {
                  toast.error("Couldn't attach", e instanceof Error ? e.message : undefined);
                } finally {
                  setPicking(null);
                }
              }}
              className="group overflow-hidden rounded-xl border border-gray-200 text-left transition-all hover:border-brand-400 hover:shadow-soft dark:border-slate-700"
            >
              {a.mime_type.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url} alt={a.file_name} className="aspect-square w-full object-cover" />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center bg-gray-100 text-gray-400 dark:bg-slate-800">
                  <Film className="h-7 w-7" />
                </div>
              )}
              <p className="truncate px-2 py-1.5 text-xs text-gray-600 dark:text-slate-300">{a.file_name}</p>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
