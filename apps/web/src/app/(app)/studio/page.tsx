"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Clock,
  FileImage,
  Heart,
  Layers,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/modal";
import { CardSkeleton, Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { TemplateThumb } from "@/components/studio/template-thumb";
import { useApp } from "@/lib/app-context";
import { designsApi, templatesApi } from "@/lib/studio";
import type { DesignSummary, Template, TemplateCategory } from "@/lib/types";
import { cn, relative } from "@/lib/utils";

const CATEGORIES: { key: TemplateCategory | ""; label: string }[] = [
  { key: "", label: "All" },
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "youtube", label: "YouTube" },
  { key: "x", label: "X" },
  { key: "pinterest", label: "Pinterest" },
  { key: "promotional", label: "Promo" },
  { key: "festival", label: "Festival" },
  { key: "announcement", label: "Announce" },
  { key: "product_launch", label: "Launch" },
];

const SIZES = [
  { label: "Instagram Post", w: 1080, h: 1080 },
  { label: "Instagram Story / Reel", w: 1080, h: 1920 },
  { label: "Facebook Post", w: 1200, h: 630 },
  { label: "Facebook Banner", w: 1640, h: 664 },
  { label: "LinkedIn Post", w: 1200, h: 627 },
  { label: "YouTube Thumbnail", w: 1280, h: 720 },
  { label: "X Post", w: 1600, h: 900 },
  { label: "Pinterest Pin", w: 1000, h: 1500 },
];

export default function StudioPage() {
  const { workspace } = useApp();
  const router = useRouter();
  const toast = useToast();
  const [category, setCategory] = useState<TemplateCategory | "">("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [blankOpen, setBlankOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [templatesCache, setTemplatesCache] = useState<Record<string, string>>({});

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const ws = workspace?.id;
  const tplKey = ws ? `templates:${ws}:${category}:${debouncedQ}:${favoritesOnly}` : null;
  const { data: tplData, isLoading: tplLoading, mutate: mutateTpl } = useSWR(
    tplKey,
    () => templatesApi.list(ws!, { category: category || undefined, q: debouncedQ || undefined, favorites: favoritesOnly }),
  );
  const { data: recent, mutate: mutateRecent } = useSWR(ws ? `recent:${ws}` : null, () => templatesApi.recent(ws!));
  const { data: designs, mutate: mutateDesigns } = useSWR(ws ? `designs:${ws}` : null, () => designsApi.list(ws!));

  // Lazily pull canvas_json for visible thumbnails (detail fetch)
  useEffect(() => {
    if (!ws || !tplData) return;
    const missing = tplData.items.filter((t) => !templatesCache[t.id]).slice(0, 24);
    if (!missing.length) return;
    let cancelled = false;
    void Promise.all(missing.map((t) => templatesApi.get(ws, t.id).catch(() => null))).then((docs) => {
      if (cancelled) return;
      setTemplatesCache((prev) => {
        const next = { ...prev };
        docs.forEach((d) => {
          if (d?.canvas_json) next[d.id] = d.canvas_json;
        });
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [ws, tplData, templatesCache]);

  const startFromTemplate = useCallback(
    async (tpl: Template) => {
      if (!ws || creating) return;
      setCreating(true);
      try {
        const design = await designsApi.create(ws, {
          name: `${tpl.name} — copy`,
          width: tpl.width,
          height: tpl.height,
          template_id: tpl.id,
        });
        router.push(`/studio/editor/${design.id}`);
      } catch (e) {
        toast.error("Couldn't open template", e instanceof Error ? e.message : undefined);
        setCreating(false);
      }
    },
    [ws, creating, router, toast],
  );

  const startBlank = useCallback(
    async (w: number, h: number, label: string) => {
      if (!ws || creating) return;
      setCreating(true);
      try {
        const design = await designsApi.create(ws, { name: `Untitled ${label}`, width: w, height: h });
        setBlankOpen(false);
        router.push(`/studio/editor/${design.id}`);
      } catch (e) {
        toast.error("Couldn't create design", e instanceof Error ? e.message : undefined);
        setCreating(false);
      }
    },
    [ws, creating, router, toast],
  );

  const toggleFav = useCallback(
    async (tpl: Template) => {
      if (!ws) return;
      await templatesApi.favorite(ws, tpl.id, !tpl.is_favorite);
      void mutateTpl();
    },
    [ws, mutateTpl],
  );

  const deleteDesign = useCallback(
    async (id: string) => {
      if (!ws) return;
      await designsApi.remove(ws, id);
      void mutateDesigns();
      toast.success("Design deleted");
    },
    [ws, mutateDesigns, toast],
  );

  const openDesign = useCallback(
    async (id: string) => {
      router.push(`/studio/editor/${id}`);
    },
    [router],
  );

  if (!workspace) return null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-slate-100">Content Creation Studio</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            Design posts, save reusable templates, and send them straight to your calendar.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => setBlankOpen(true)}>
            Blank canvas
          </Button>
          <Button icon={<Sparkles className="h-4 w-4" />} onClick={() => document.getElementById("tpl-grid")?.scrollIntoView({ behavior: "smooth" })}>
            Browse templates
          </Button>
        </div>
      </div>

      {/* Your designs */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
            <Layers className="h-4 w-4" /> Your designs
          </h2>
        </div>
        {!designs ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : designs.items.length === 0 ? (
          <EmptyState
            icon={<FileImage />}
            title="No designs yet"
            description="Pick a template below or start from a blank canvas — everything you make stays editable."
          />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {designs.items.map((d) => (
              <Card
                key={d.id}
                className="group cursor-pointer overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lift"
                onClick={() => void openDesign(d.id)}
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-gray-100 dark:bg-slate-800">
                  {d.thumbnail_path ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.thumbnail_path} alt={d.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-gray-300 dark:text-slate-600">
                      <FileImage className="h-8 w-8" />
                    </div>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteDesign(d.id);
                    }}
                    aria-label="Delete design"
                    className="absolute right-2 top-2 rounded-lg bg-black/50 p-1.5 text-white opacity-0 backdrop-blur transition-opacity hover:bg-rose-600 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="px-3.5 py-3">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-slate-100">{d.name}</p>
                  <p className="mt-0.5 text-xs text-gray-400 dark:text-slate-500">
                    {d.width}×{d.height} · {relative(d.updated_at)}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Recent */}
      {!!recent?.length && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
            <Clock className="h-4 w-4" /> Recently used
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {recent.map((t) => (
              <button
                key={t.id}
                onClick={() => void startFromTemplate(t)}
                className="w-36 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white text-left transition-all hover:-translate-y-0.5 hover:shadow-lift dark:border-slate-700 dark:bg-[#141926]"
              >
                <TemplateThumb canvasJson={templatesCache[t.id] ?? null} width={t.width} height={t.height} className="aspect-[4/3] w-full" />
                <p className="truncate px-2.5 py-2 text-xs font-medium text-gray-800 dark:text-slate-200">{t.name}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Filter bar */}
      <section id="tpl-grid" className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search templates…"
              className="pl-9"
              aria-label="Search templates"
            />
          </div>
          <button
            onClick={() => setFavoritesOnly((f) => !f)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              favoritesOnly
                ? "border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-400"
                : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800",
            )}
          >
            <Heart className={cn("h-4 w-4", favoritesOnly && "fill-current")} /> Favorites
          </button>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                category === c.key
                  ? "bg-brand-600 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Template grid */}
        {tplLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[4/5] w-full" />
            ))}
          </div>
        ) : !tplData?.items.length ? (
          <EmptyState icon={<Search />} title="No templates match" description="Try a different search or category." />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            <AnimatePresence mode="popLayout">
              {tplData.items.map((t) => (
                <motion.div
                  key={t.id}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                >
                  <Card className="group overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-lift">
                    <button onClick={() => void startFromTemplate(t)} className="block w-full text-left">
                      <div className="relative overflow-hidden bg-gray-100 dark:bg-slate-800">
                        <TemplateThumb
                          canvasJson={templatesCache[t.id] ?? null}
                          width={t.width}
                          height={t.height}
                          className="w-full"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-ink/0 opacity-0 transition-all group-hover:bg-ink/40 group-hover:opacity-100">
                          <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-lift">
                            Use template
                          </span>
                        </div>
                      </div>
                    </button>
                    <div className="flex items-center justify-between gap-2 px-3.5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900 dark:text-slate-100">{t.name}</p>
                        <div className="mt-1 flex items-center gap-1.5">
                          <Badge tone={t.is_builtin ? "violet" : "brand"}>{t.is_builtin ? "Built-in" : "Yours"}</Badge>
                          <span className="text-[11px] text-gray-400 dark:text-slate-500">
                            {t.width}×{t.height}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => void toggleFav(t)}
                        aria-label="Toggle favorite"
                        className={cn(
                          "rounded-lg p-1.5 transition-colors",
                          t.is_favorite
                            ? "text-rose-500"
                            : "text-gray-300 hover:text-rose-400 dark:text-slate-600",
                        )}
                      >
                        <Heart className={cn("h-4 w-4", t.is_favorite && "fill-current")} />
                      </button>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </section>

      {/* Blank canvas modal */}
      <Modal open={blankOpen} onClose={() => setBlankOpen(false)} title="New blank canvas" width="max-w-lg">
        <p className="mb-4 text-sm text-gray-500 dark:text-slate-400">Pick a canvas size — you can resize later.</p>
        <div className="grid grid-cols-2 gap-2.5">
          {SIZES.map((s) => (
            <button
              key={s.label}
              onClick={() => void startBlank(s.w, s.h, s.label)}
              disabled={creating}
              className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/50 dark:border-slate-700 dark:hover:border-brand-500/50 dark:hover:bg-brand-500/10"
            >
              <span className="text-sm font-medium text-gray-800 dark:text-slate-200">{s.label}</span>
              <span className="text-xs text-gray-400 dark:text-slate-500">
                {s.w}×{s.h}
              </span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
