"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowUpToLine,
  Bold,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  FolderPlus,
  Image as ImageIcon,
  Italic,
  Loader2,
  Lock,
  Unlock,
  Palette,
  Type,
  Underline,
  Upload,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { BgMeta, EditorApi, FONTS, makePattern } from "@/components/studio/editor";
import { brandKitsApi, designsApi, libraryApi } from "@/lib/studio";
import type { BrandKit, DesignVersion, LibraryAsset } from "@/lib/types";
import { cn, formatBytes, relative } from "@/lib/utils";

const PRESET_COLORS = [
  "#111827", "#ffffff", "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f59e0b", "#10b981", "#0ea5e9", "#64748b", "#f8fafc", "#0f172a",
];

const GRADIENTS: [string, string][] = [
  ["#4f46e5", "#7c3aed"], ["#f59e0b", "#ef4444"], ["#0ea5e9", "#6366f1"],
  ["#10b981", "#0ea5e9"], ["#ec4899", "#8b5cf6"], ["#f43f5e", "#fb923c"],
  ["#0f172a", "#334155"], ["#7c2d12", "#fbbf24"], ["#fdfbfb", "#ebedee"],
];

const PATTERNS = ["dots", "grid", "diagonal", "checker", "cross"];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">{children}</p>;
}

function Swatch({ hex, onClick, ring }: { hex: string; onClick?: () => void; ring?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={hex}
      style={{ background: hex }}
      className={cn(
        "h-8 w-8 rounded-lg border border-black/10 transition-transform hover:scale-110 dark:border-white/10",
        ring && "ring-2 ring-brand-500 ring-offset-1 dark:ring-offset-[#10141f]",
      )}
    />
  );
}

// ---------- Text ----------

export function TextPanel({ api }: { api: EditorApi }) {
  const items: { label: string; preset: "heading" | "subheading" | "body"; cls: string }[] = [
    { label: "Heading", preset: "heading", cls: "text-xl font-bold" },
    { label: "Subheading", preset: "subheading", cls: "text-base font-semibold" },
    { label: "Body text", preset: "body", cls: "text-sm" },
  ];
  return (
    <div className="space-y-2">
      <SectionTitle>Add text</SectionTitle>
      {items.map((i) => (
        <button
          key={i.preset}
          onClick={() => api.addText(i.preset)}
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40 dark:border-slate-700 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/10"
        >
          <span className={cn(i.cls, "text-gray-800 dark:text-slate-100")}>{i.label}</span>
        </button>
      ))}
      <p className="pt-2 text-xs leading-relaxed text-gray-400 dark:text-slate-500">
        Double-click text on the canvas to edit it. Select it to change font, size, colour and alignment.
      </p>
    </div>
  );
}

// ---------- Elements / shapes ----------

export function ElementsPanel({ api }: { api: EditorApi }) {
  const shapes: { kind: Parameters<EditorApi["addShape"]>[0]; label: string; preview: React.ReactNode }[] = [
    { kind: "rect", label: "Rectangle", preview: <div className="h-8 w-10 rounded-sm bg-brand-500" /> },
    { kind: "rounded", label: "Rounded", preview: <div className="h-8 w-10 rounded-lg bg-brand-500" /> },
    { kind: "pill", label: "Pill", preview: <div className="h-6 w-12 rounded-full bg-brand-500" /> },
    { kind: "circle", label: "Circle", preview: <div className="h-9 w-9 rounded-full bg-brand-500" /> },
    { kind: "triangle", label: "Triangle", preview: <div className="h-0 w-0 border-b-[34px] border-l-[18px] border-r-[18px] border-b-brand-500 border-l-transparent border-r-transparent" /> },
    { kind: "line", label: "Line", preview: <div className="h-1.5 w-12 rounded-full bg-brand-500" /> },
  ];
  return (
    <div>
      <SectionTitle>Shapes</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        {shapes.map((s) => (
          <button
            key={s.kind}
            onClick={() => api.addShape(s.kind)}
            className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 p-3 transition-colors hover:border-brand-300 hover:bg-brand-50/40 dark:border-slate-700 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/10"
          >
            {s.preview}
            <span className="text-xs text-gray-500 dark:text-slate-400">{s.label}</span>
          </button>
        ))}
      </div>
      <p className="pt-3 text-xs leading-relaxed text-gray-400 dark:text-slate-500">
        Drag corners to resize, the top handle to rotate, and right panel to recolour.
      </p>
    </div>
  );
}

// ---------- Uploads (library picker + upload) ----------

export function UploadsPanel({ api, ws }: { api: EditorApi; ws: string }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { data, mutate } = useSWR(`lib:${ws}:image`, () => libraryApi.list(ws, { mime: "image" }));

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const asset = await libraryApi.upload(ws, file, "");
        await api.addImageUrl(asset.url, asset.file_name);
      }
      void mutate();
      toast.success("Uploaded to library");
    } catch (e) {
      toast.error("Upload failed", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void onFiles(e.dataTransfer.files);
        }}
        className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-4 py-6 text-center transition-colors hover:border-brand-400 hover:bg-brand-50/40 dark:border-slate-600 dark:hover:border-brand-500 dark:hover:bg-brand-500/10"
      >
        {busy ? <Loader2 className="h-6 w-6 animate-spin text-brand-500" /> : <Upload className="h-6 w-6 text-brand-500" />}
        <span className="text-sm font-medium text-gray-700 dark:text-slate-200">Upload or drop images</span>
        <span className="text-xs text-gray-400">PNG, JPG, WebP, GIF</span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onFiles(e.target.files)} />

      <SectionTitle>From your library</SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        {(data?.items ?? []).slice(0, 30).map((a) => (
          <button
            key={a.id}
            onClick={() => void api.addImageUrl(a.url, a.file_name)}
            className="group overflow-hidden rounded-lg border border-gray-200 transition-all hover:border-brand-400 hover:shadow-soft dark:border-slate-700"
            title={a.file_name}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.url} alt={a.file_name} className="aspect-square w-full object-cover" />
          </button>
        ))}
        {!data?.items.length && <p className="col-span-2 py-4 text-center text-xs text-gray-400">No images yet — upload above.</p>}
      </div>
    </div>
  );
}

// ---------- Background ----------

export function BackgroundPanel({ api, current }: { api: EditorApi; current: BgMeta }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [meta, setMeta] = useState<BgMeta>(current);
  const [opacity, setOpacity] = useState(current.opacity ?? 1);
  const [blur, setBlur] = useState(current.blur ?? 0);
  const [fit, setFit] = useState(current.fit ?? "cover");
  const [position, setPosition] = useState(current.position ?? 4);
  const [customColor, setCustomColor] = useState(current.color ?? "#ffffff");

  useEffect(() => setMeta(current), [current]);

  const apply = (m: BgMeta) => {
    setMeta(m);
    void api.setBg(m);
  };

  return (
    <div className="space-y-4">
      <div>
        <SectionTitle>Solid</SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          {PRESET_COLORS.map((c) => (
            <Swatch key={c} hex={c} ring={meta.kind === "solid" && meta.color === c} onClick={() => apply({ kind: "solid", color: c })} />
          ))}
          <input
            type="color"
            value={customColor}
            onChange={(e) => {
              setCustomColor(e.target.value);
              apply({ kind: "solid", color: e.target.value });
            }}
            className="h-8 w-8 cursor-pointer rounded-lg border border-gray-200 dark:border-slate-700"
            title="Custom colour"
          />
        </div>
      </div>

      <div>
        <SectionTitle>Gradients</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          {GRADIENTS.map(([a, b]) => (
            <button
              key={a + b}
              onClick={() => apply({ kind: "gradient", from: a, to: b, angle: "vertical" })}
              style={{ background: `linear-gradient(180deg, ${a}, ${b})` }}
              className="h-10 rounded-lg transition-transform hover:scale-105"
              title={`${a} → ${b}`}
            />
          ))}
        </div>
        {meta.kind === "gradient" && (
          <div className="mt-2 flex gap-1">
            {(["vertical", "horizontal", "diagonal"] as const).map((a) => (
              <button
                key={a}
                onClick={() => apply({ ...meta, angle: a })}
                className={cn(
                  "flex-1 rounded-md px-2 py-1 text-xs capitalize",
                  meta.angle === a ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300",
                )}
              >
                {a}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <SectionTitle>Patterns</SectionTitle>
        <div className="grid grid-cols-5 gap-2">
          {PATTERNS.map((p) => (
            <button
              key={p}
              onClick={() => apply({ kind: "pattern", pattern: p, color: meta.color ?? "#6366f1" })}
              className={cn(
                "h-10 rounded-lg border border-gray-200 transition-transform hover:scale-105 dark:border-slate-700",
                meta.kind === "pattern" && meta.pattern === p && "ring-2 ring-brand-500",
              )}
              title={p}
              style={{
                backgroundImage: `url(${patternDataUrl(p, meta.color ?? "#6366f1")})`,
                backgroundSize: "14px",
              }}
            />
          ))}
        </div>
        {meta.kind === "pattern" && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PRESET_COLORS.map((c) => (
              <Swatch key={c} hex={c} ring={meta.color === c} onClick={() => apply({ ...meta, color: c })} />
            ))}
          </div>
        )}
      </div>

      <div>
        <SectionTitle>Image</SectionTitle>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 px-4 py-4 text-sm text-gray-600 transition-colors hover:border-brand-400 dark:border-slate-600 dark:text-slate-300"
        >
          <ImageIcon className="h-4 w-4" /> {meta.kind === "image" ? "Replace background image" : "Upload background image"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const url = URL.createObjectURL(f);
            apply({ kind: "image", imageUrl: url, fit, opacity, blur, position });
          }}
        />
        {meta.kind === "image" && (
          <div className="mt-3 space-y-3">
            <div>
              <Label>Fit</Label>
              <div className="grid grid-cols-4 gap-1">
                {(["cover", "contain", "stretch", "tile"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => {
                      setFit(f);
                      apply({ ...meta, fit: f });
                    }}
                    className={cn(
                      "rounded-md px-1 py-1.5 text-xs capitalize",
                      fit === f ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300",
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            {fit !== "cover" && fit !== "stretch" && (
              <div>
                <Label>Position</Label>
                <div className="grid w-20 grid-cols-3 gap-0.5">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setPosition(i);
                        apply({ ...meta, position: i });
                      }}
                      className={cn("h-6 rounded-sm border", position === i ? "border-brand-500 bg-brand-500" : "border-gray-300 dark:border-slate-600")}
                      aria-label={`Position ${i + 1}`}
                    />
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label hint={`${Math.round(opacity * 100)}%`}>Opacity</Label>
              <input
                type="range" min={5} max={100} value={Math.round(opacity * 100)}
                onChange={(e) => {
                  const v = Number(e.target.value) / 100;
                  setOpacity(v);
                  apply({ ...meta, opacity: v });
                }}
                className="w-full accent-brand-600"
              />
            </div>
            <div>
              <Label hint={`${blur}%`}>Blur</Label>
              <input
                type="range" min={0} max={60} value={blur}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setBlur(v);
                  apply({ ...meta, blur: v });
                }}
                className="w-full accent-brand-600"
              />
            </div>
            <button
              onClick={() => apply({ kind: "solid", color: "#ffffff" })}
              className="w-full rounded-lg border border-gray-200 py-1.5 text-xs text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Remove image
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function patternDataUrl(kind: string, color: string): string {
  const tile = makePattern(kind, color);
  return tile.toDataURL();
}

// ---------- Brand kit ----------

export function BrandPanel({ api, ws }: { api: EditorApi; ws: string }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kitId, setKitId] = useState<string | null>(null);
  const [newColor, setNewColor] = useState("#6366f1");
  const { data: kits, mutate } = useSWR(`kits:${ws}`, () => brandKitsApi.list(ws));
  const kit = kits?.find((k) => k.id === kitId) ?? kits?.find((k) => k.is_default) ?? kits?.[0];

  const createKit = async () => {
    const name = window.prompt("Brand kit name", "Brand Kit");
    if (!name?.trim()) return;
    const k = await brandKitsApi.create(ws, { name: name.trim() });
    setKitId(k.id);
    void mutate();
  };

  const addColor = async () => {
    if (!kit) return;
    await brandKitsApi.update(ws, kit.id, { colors: [...kit.colors, { name: newColor, hex: newColor }] });
    void mutate();
  };

  const removeColor = async (hex: string) => {
    if (!kit) return;
    await brandKitsApi.update(ws, kit.id, { colors: kit.colors.filter((c) => c.hex !== hex) });
    void mutate();
  };

  const uploadLogo = async (f: File | undefined) => {
    if (!f || !kit) return;
    await brandKitsApi.uploadAsset(ws, kit.id, f, "logo");
    void mutate();
    toast.success("Logo added to brand kit");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle>Brand kit</SectionTitle>
        <button onClick={() => void createKit()} className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
          + New kit
        </button>
      </div>

      {!!kits?.length && (
        <select
          value={kit?.id ?? ""}
          onChange={(e) => setKitId(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-[#10151f] dark:text-slate-200"
        >
          {kits.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
              {k.is_default ? " · default" : ""}
            </option>
          ))}
        </select>
      )}

      {!kit ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-4 text-center text-xs text-gray-500 dark:border-slate-600 dark:text-slate-400">
          <Palette className="mx-auto mb-2 h-5 w-5 text-brand-400" />
          Create a brand kit to keep logos, colours and fonts one click away.
          <div className="mt-3">
            <Button size="sm" onClick={() => void createKit()}>
              Create kit
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div>
            <SectionTitle>Logos</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              {kit.logos.map((l) => (
                <button
                  key={l.id}
                  onClick={() => void api.addImageUrl(l.url, l.file_name)}
                  className="overflow-hidden rounded-lg border border-gray-200 hover:border-brand-400 dark:border-slate-700"
                  title="Add to canvas"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={l.url} alt={l.file_name} className="aspect-square w-full object-contain bg-gray-50 p-2 dark:bg-slate-800" />
                </button>
              ))}
              <button
                onClick={() => fileRef.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 text-xs text-gray-500 hover:border-brand-400 dark:border-slate-600 dark:text-slate-400"
              >
                <Upload className="h-4 w-4" /> Logo
              </button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void uploadLogo(e.target.files?.[0])} />
            </div>
          </div>

          {!!kit.images.length && (
            <div>
              <SectionTitle>Brand images</SectionTitle>
              <div className="grid grid-cols-2 gap-2">
                {kit.images.map((l) => (
                  <button key={l.id} onClick={() => void api.addImageUrl(l.url, l.file_name)} className="overflow-hidden rounded-lg border border-gray-200 hover:border-brand-400 dark:border-slate-700">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={l.url} alt={l.file_name} className="aspect-square w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <SectionTitle>Colours — click applies to selection or background</SectionTitle>
            <div className="flex flex-wrap items-center gap-1.5">
              {kit.colors.map((c) => (
                <div key={c.hex} className="group relative">
                  <Swatch
                    hex={c.hex}
                    onClick={() => {
                      const obj = api.canvas()?.getActiveObject();
                      if (obj && "fill" in obj) api.setProp("fill", c.hex);
                      else void api.setBg({ kind: "solid", color: c.hex });
                    }}
                  />
                  <button
                    onClick={() => void removeColor(c.hex)}
                    className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-white group-hover:flex"
                    aria-label="Remove colour"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
              <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="h-8 w-8 rounded-lg border border-gray-200 dark:border-slate-700" title="Pick colour" />
              <button onClick={() => void addColor()} className="rounded-lg bg-gray-100 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300">
                + Add
              </button>
            </div>
          </div>

          <div>
            <SectionTitle>Fonts — applies to selected text</SectionTitle>
            <div className="flex flex-wrap gap-1.5">
              {FONTS.map((f) => (
                <button
                  key={f}
                  onClick={() => api.setProp("fontFamily", f)}
                  style={{ fontFamily: f }}
                  className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 hover:border-brand-400 dark:border-slate-700 dark:text-slate-300"
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Layers ----------

export function LayersPanel({ objects, selected, api }: { objects: import("fabric").FabricObject[]; selected: import("fabric").FabricObject | null; api: EditorApi }) {
  return (
    <div>
      <SectionTitle>Layers ({objects.length})</SectionTitle>
      {!objects.length && <p className="py-6 text-center text-xs text-gray-400">Canvas is empty.</p>}
      <div className="space-y-1">
        {objects.map((o, i) => {
          const label = layerLabel(o);
          const active = selected === o;
          return (
            <div
              key={i}
              onClick={() => api.selectObject(o)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors",
                active ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800",
                !o.visible && "opacity-45",
              )}
            >
              <span className="flex-1 truncate text-xs">{label}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  api.toggleVisible(o);
                }}
                aria-label="Toggle visibility"
                className="rounded p-1 text-gray-400 hover:text-gray-700 dark:hover:text-slate-200"
              >
                {o.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function layerLabel(o: import("fabric").FabricObject): string {
  const t = (o.type ?? "object").toLowerCase();
  if (t === "textbox" || t === "i-text" || t === "text") {
    const txt = (o as import("fabric").Textbox).text ?? "";
    return txt.length > 22 ? txt.slice(0, 22) + "…" : txt || "Text";
  }
  if (t === "image") return "Image";
  if (t === "rect") return "Rectangle";
  if (t === "circle") return "Circle";
  if (t === "triangle") return "Triangle";
  if (t === "line") return "Line";
  return t;
}

// ---------- Versions ----------

export function VersionsPanel({ ws, designId, onRestore }: { ws: string; designId: string; onRestore: (id: string) => Promise<void> }) {
  const toast = useToast();
  const [restoring, setRestoring] = useState<string | null>(null);
  const { data: versions, mutate } = useSWR(`versions:${designId}`, () => designsApi.versions(ws, designId), {
    refreshInterval: 0,
  });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <SectionTitle>Version history</SectionTitle>
        <button onClick={() => void mutate()} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-slate-300">
          Refresh
        </button>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-gray-400 dark:text-slate-500">Every save is a version. Restore any earlier state.</p>
      <div className="space-y-1.5">
        {(versions ?? []).map((v, i) => (
          <div key={v.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-2.5 py-2 dark:border-slate-700">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-gray-800 dark:text-slate-200">
                {v.note || "Saved"} {i === 0 && <span className="text-brand-500">· latest</span>}
              </p>
              <p className="text-[11px] text-gray-400 dark:text-slate-500">{relative(v.created_at)}</p>
            </div>
            <button
              onClick={async () => {
                setRestoring(v.id);
                try {
                  await onRestore(v.id);
                } catch (e) {
                  toast.error("Restore failed", e instanceof Error ? e.message : undefined);
                } finally {
                  setRestoring(null);
                }
              }}
              disabled={restoring === v.id}
              className="shrink-0 rounded-md bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              {restoring === v.id ? "…" : "Restore"}
            </button>
          </div>
        ))}
        {!versions?.length && <p className="py-4 text-center text-xs text-gray-400">No versions yet.</p>}
      </div>
    </div>
  );
}

// ---------- Inspector (selected object properties) ----------

export function Inspector({ obj, isText, api }: { obj: import("fabric").FabricObject; isText: boolean; api: EditorApi }) {
  const [, tick] = useState(0);
  const refresh = () => tick((t) => t + 1);
  const set = (k: string, v: unknown) => {
    api.setProp(k, v);
    refresh();
  };

  const fill = typeof obj.fill === "string" ? obj.fill : "#6366f1";
  const textObj = obj as import("fabric").Textbox;

  return (
    <div className="space-y-4">
      {isText && (
        <>
          <div>
            <Label>Font</Label>
            <select
              value={textObj.fontFamily ?? "Arial"}
              onChange={(e) => set("fontFamily", e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-[#10151f] dark:text-slate-200"
            >
              {FONTS.map((f) => (
                <option key={f} value={f} style={{ fontFamily: f }}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label>Size</Label>
              <Input type="number" min={6} max={400} value={Math.round(textObj.fontSize ?? 32)} onChange={(e) => set("fontSize", Number(e.target.value))} />
            </div>
            <div className="flex gap-0.5 pb-0.5">
              <FmtBtn active={textObj.fontWeight === "bold" || textObj.fontWeight === "700"} onClick={() => set("fontWeight", textObj.fontWeight === "bold" ? "normal" : "bold")} title="Bold">
                <Bold className="h-3.5 w-3.5" />
              </FmtBtn>
              <FmtBtn active={!!textObj.fontStyle && textObj.fontStyle === "italic"} onClick={() => set("fontStyle", textObj.fontStyle === "italic" ? "normal" : "italic")} title="Italic">
                <Italic className="h-3.5 w-3.5" />
              </FmtBtn>
              <FmtBtn active={!!textObj.underline} onClick={() => set("underline", !textObj.underline)} title="Underline">
                <Underline className="h-3.5 w-3.5" />
              </FmtBtn>
            </div>
          </div>
          <div>
            <Label>Alignment</Label>
            <div className="flex gap-1">
              {[
                { v: "left", icon: AlignLeft },
                { v: "center", icon: AlignCenter },
                { v: "right", icon: AlignRight },
              ].map(({ v, icon: I }) => (
                <FmtBtn key={v} active={textObj.textAlign === v} onClick={() => set("textAlign", v)} title={v} wide>
                  <I className="h-3.5 w-3.5" />
                </FmtBtn>
              ))}
            </div>
          </div>
        </>
      )}

      {("fill" in obj || isText) && (
        <div>
          <Label>{isText ? "Text colour" : "Fill"}</Label>
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESET_COLORS.map((c) => (
              <Swatch key={c} hex={c} ring={fill === c} onClick={() => set("fill", c)} />
            ))}
            <input type="color" value={fill.startsWith("#") ? fill.slice(0, 7) : "#6366f1"} onChange={(e) => set("fill", e.target.value)} className="h-8 w-8 rounded-lg border border-gray-200 dark:border-slate-700" />
          </div>
        </div>
      )}

      <div>
        <Label hint={`${Math.round((obj.opacity ?? 1) * 100)}%`}>Opacity</Label>
        <input
          type="range" min={5} max={100} value={Math.round((obj.opacity ?? 1) * 100)}
          onChange={(e) => set("opacity", Number(e.target.value) / 100)}
          className="w-full accent-brand-600"
        />
      </div>

      <div>
        <Label hint={`${Math.round(obj.angle ?? 0)}°`}>Rotation</Label>
        <input type="range" min={-180} max={180} value={Math.round(obj.angle ?? 0)} onChange={(e) => set("angle", Number(e.target.value))} className="w-full accent-brand-600" />
      </div>

      <div className="flex gap-1.5">
        <button onClick={() => api.reorder("top")} title="Bring to front" className="flex-1 rounded-lg border border-gray-200 py-1.5 text-xs text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
          <ArrowUpToLine className="mx-auto h-3.5 w-3.5" />
        </button>
        <button onClick={() => api.reorder("bottom")} title="Send to back" className="flex-1 rounded-lg border border-gray-200 py-1.5 text-xs text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
          <ArrowDownToLine className="mx-auto h-3.5 w-3.5" />
        </button>
        <button onClick={() => api.toggleLock()} title="Lock/unlock" className="flex-1 rounded-lg border border-gray-200 py-1.5 text-xs text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
          {obj.selectable ? <Lock className="mx-auto h-3.5 w-3.5" /> : <Unlock className="mx-auto h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

function FmtBtn({ children, active, onClick, title, wide }: { children: React.ReactNode; active?: boolean; onClick: () => void; title: string; wide?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "rounded-lg border py-1.5 transition-colors",
        wide ? "flex-1" : "px-2.5",
        active
          ? "border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-500/15 dark:text-brand-300"
          : "border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800",
      )}
    >
      <span className="flex justify-center">{children}</span>
    </button>
  );
}
