"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  Copy,
  Download,
  Eye,
  EyeOff,
  Layers,
  Lock,
  Redo2,
  Save,
  Send,
  Trash2,
  Undo2,
  Unlock,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { BackgroundPanel, BrandPanel, ElementsPanel, Inspector, LayersPanel, TextPanel, UploadsPanel, VersionsPanel } from "@/components/studio/panels";
import { ScheduleModal } from "@/components/studio/schedule-modal";
import { loadFabric } from "@/components/studio/template-thumb";
import { designsApi, templatesApi } from "@/lib/studio";
import type { Design } from "@/lib/types";
import { cn } from "@/lib/utils";

type Fabric = typeof import("fabric");
type FCanvas = import("fabric").Canvas;
type FObject = import("fabric").FabricObject;

export const FONTS = [
  "Arial", "Helvetica", "Georgia", "Times New Roman", "Courier New",
  "Verdana", "Trebuchet MS", "Impact", "Palatino", "Garamond",
];

export interface EditorApi {
  canvas: () => FCanvas | null;
  fabric: () => Fabric | null;
  addText: (preset?: "heading" | "subheading" | "body") => void;
  addShape: (kind: "rect" | "rounded" | "circle" | "triangle" | "line" | "pill") => void;
  addImageUrl: (url: string, name?: string) => Promise<void>;
  duplicate: () => Promise<void>;
  remove: () => void;
  reorder: (dir: "up" | "down" | "top" | "bottom") => void;
  toggleLock: () => void;
  toggleVisible: (obj?: FObject) => void;
  setProp: (key: string, value: unknown) => void;
  setBg: (meta: BgMeta) => Promise<void>;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomFit: () => void;
  undo: () => void;
  redo: () => void;
  save: (note?: string) => Promise<void>;
  exportBlob: (format: "png" | "jpeg") => Promise<Blob>;
  download: (format: "png" | "jpeg") => Promise<void>;
  selectObject: (obj: FObject | null) => void;
}

export interface BgMeta {
  kind: "solid" | "gradient" | "pattern" | "image";
  color?: string;
  from?: string;
  to?: string;
  angle?: "vertical" | "horizontal" | "diagonal";
  pattern?: string;
  imageUrl?: string;
  fit?: "cover" | "contain" | "stretch" | "tile";
  opacity?: number;
  blur?: number;
  position?: number; // 0-8 grid anchor
}

const TABS = [
  { key: "text", label: "Text" },
  { key: "elements", label: "Elements" },
  { key: "uploads", label: "Uploads" },
  { key: "background", label: "Background" },
  { key: "brand", label: "Brand" },
  { key: "layers", label: "Layers" },
  { key: "versions", label: "Versions" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function DesignEditor({ ws, design: initial }: { ws: string; design: Design }) {
  const router = useRouter();
  const toast = useToast();
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<FCanvas | null>(null);
  const fabricRef = useRef<Fabric | null>(null);
  const historyRef = useRef<{ stack: string[]; index: number; restoring: boolean }>({ stack: [], index: -1, restoring: false });
  const dirtyRef = useRef(false);
  const designRef = useRef(initial);
  const bgMetaRef = useRef<BgMeta>({ kind: "solid", color: "#ffffff" });

  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<TabKey>("text");
  const [sel, setSel] = useState<FObject | null>(null);
  const [, forceTick] = useState(0);
  const [name, setName] = useState(initial.name);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [zoomPct, setZoomPct] = useState(100);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [objects, setObjects] = useState<FObject[]>([]);
  const [undoLen, setUndoLen] = useState(0);
  const [redoLen, setRedoLen] = useState(0);

  const syncObjects = useCallback(() => {
    const c = canvasRef.current;
    setObjects(c ? [...c.getObjects()].reverse() : []);
  }, []);

  const snapshot = useCallback(() => {
    const c = canvasRef.current;
    const h = historyRef.current;
    if (!c || h.restoring) return;
    const json = JSON.stringify(c.toObject(["bgMeta"]));
    h.stack = h.stack.slice(0, h.index + 1);
    h.stack.push(json);
    if (h.stack.length > 60) h.stack.shift();
    h.index = h.stack.length - 1;
    setUndoLen(h.index);
    setRedoLen(h.stack.length - 1 - h.index);
    dirtyRef.current = true;
    setDirty(true);
    syncObjects();
    forceTick((t) => t + 1);
  }, [syncObjects]);

  const applyZoom = useCallback((zoom: number) => {
    const c = canvasRef.current;
    const area = areaRef.current;
    if (!c || !area) return;
    const d = designRef.current;
    const tx = (area.clientWidth - d.width * zoom) / 2;
    const ty = (area.clientHeight - d.height * zoom) / 2;
    c.setViewportTransform([zoom, 0, 0, zoom, Math.max(tx, 24), Math.max(ty, 24)]);
    setZoomPct(Math.round(zoom * 100));
  }, []);

  const zoomFit = useCallback(() => {
    const area = areaRef.current;
    const d = designRef.current;
    if (!area) return;
    applyZoom(Math.min((area.clientWidth - 80) / d.width, (area.clientHeight - 80) / d.height, 2));
  }, [applyZoom]);

  // ---------- canvas init ----------
  useEffect(() => {
    let disposed = false;
    (async () => {
      const fabric = await loadFabric();
      if (disposed || !canvasEl.current || !areaRef.current) return;
      fabricRef.current = fabric;
      const c = new fabric.Canvas(canvasEl.current, {
        preserveObjectStacking: true,
        backgroundColor: "#ffffff",
        selection: true,
        uniformScaling: false,
      });
      const d = designRef.current;
      c.setDimensions({ width: Math.max(areaRef.current.clientWidth - 8, d.width), height: Math.max(areaRef.current.clientHeight - 8, d.height) });
      try {
        await c.loadFromJSON(d.canvas_json || "{}");
      } catch {
        /* blank canvas on parse failure */
      }
      const meta = (c as unknown as { bgMeta?: BgMeta }).bgMeta;
      if (meta) bgMetaRef.current = meta;
      if (disposed) {
        c.dispose();
        return;
      }
      canvasRef.current = c;
      const rerender = () => setSel((s) => s); // noop refresh
      const onSel = () => setSel(c.getActiveObject() ?? null);
      c.on("selection:created", onSel);
      c.on("selection:updated", onSel);
      c.on("selection:cleared", () => setSel(null));
      c.on("object:added", () => !historyRef.current.restoring && snapshot());
      c.on("object:modified", () => !historyRef.current.restoring && snapshot());
      c.on("object:removed", () => !historyRef.current.restoring && snapshot());
      c.on("object:moving", syncObjects);
      c.on("object:scaling", syncObjects);
      void rerender;
      syncObjects();
      historyRef.current = { stack: [JSON.stringify(c.toObject(["bgMeta"]))], index: 0, restoring: false };
      setUndoLen(0);
      setRedoLen(0);
      setReady(true);
      // initial fit after layout settles
      requestAnimationFrame(() => zoomFit());
    })();
    return () => {
      disposed = true;
      try {
        canvasRef.current?.dispose();
      } catch {
        /* noop */
      }
      canvasRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      const c = canvasRef.current;
      if (!c) return;
      if ((e.key === "Delete" || e.key === "Backspace") && c.getActiveObjects().length) {
        e.preventDefault();
        apiRef.current?.remove();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? apiRef.current?.redo() : apiRef.current?.undo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        apiRef.current?.redo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        void apiRef.current?.duplicate();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void apiRef.current?.save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---------- background ----------
  const setBg = useCallback(
    async (meta: BgMeta) => {
      const c = canvasRef.current;
      const fabric = fabricRef.current;
      if (!c || !fabric) return;
      bgMetaRef.current = meta;
      (c as unknown as { bgMeta?: BgMeta }).bgMeta = meta;
      const w = designRef.current.width;
      const h = designRef.current.height;

      c.backgroundImage = undefined;
      if (meta.kind === "solid") {
        c.backgroundColor = meta.color ?? "#ffffff";
      } else if (meta.kind === "gradient") {
        const coords =
          meta.angle === "horizontal"
            ? { x1: 0, y1: 0, x2: w, y2: 0 }
            : meta.angle === "diagonal"
              ? { x1: 0, y1: 0, x2: w, y2: h }
              : { x1: 0, y1: 0, x2: 0, y2: h };
        c.backgroundColor = new fabric.Gradient({
          type: "linear",
          gradientUnits: "pixels",
          coords,
          colorStops: [
            { offset: 0, color: meta.from ?? "#4f46e5" },
            { offset: 1, color: meta.to ?? "#7c3aed" },
          ],
        });
      } else if (meta.kind === "pattern") {
        c.backgroundColor = new fabric.Pattern({
          source: makePattern(meta.pattern ?? "dots", meta.color ?? "#6366f1"),
          repeat: "repeat",
        });
      } else if (meta.kind === "image" && meta.imageUrl) {
        const img = await fabric.FabricImage.fromURL(meta.imageUrl, { crossOrigin: "anonymous" });
        const iw = img.width ?? w;
        const ih = img.height ?? h;
        let sx = 1;
        let sy = 1;
        const fit = meta.fit ?? "cover";
        if (fit === "cover") sx = sy = Math.max(w / iw, h / ih);
        else if (fit === "contain") sx = sy = Math.min(w / iw, h / ih);
        else if (fit === "stretch") {
          sx = w / iw;
          sy = h / ih;
        } else if (fit === "tile") {
          sx = sy = 1;
        }
        img.set({
          scaleX: sx,
          scaleY: sy,
          opacity: meta.opacity ?? 1,
          originX: "center",
          originY: "center",
          left: w / 2,
          top: h / 2,
        });
        // anchor offset for non-cover fits
        const anchors: [number, number][] = [
          [0, 0], [0.5, 0], [1, 0],
          [0, 0.5], [0.5, 0.5], [1, 0.5],
          [0, 1], [0.5, 1], [1, 1],
        ];
        const [ax, ay] = anchors[meta.position ?? 4];
        if (fit !== "cover" && fit !== "stretch") {
          img.set({ left: ax * w, top: ay * h, originX: ax === 0 ? "left" : ax === 1 ? "right" : "center", originY: ay === 0 ? "top" : ay === 1 ? "bottom" : "center" });
        }
        const blur = meta.blur ?? 0;
        if (blur > 0) {
          img.filters = [new fabric.filters.Blur({ blur: blur / 100 })];
          img.applyFilters();
        } else {
          img.filters = [];
          img.applyFilters();
        }
        c.backgroundColor = "";
        c.backgroundImage = img;
      }
      c.renderAll();
      snapshot();
    },
    [snapshot],
  );

  // ---------- editor api ----------
  const apiRef = useRef<EditorApi | null>(null);
  apiRef.current = {
    canvas: () => canvasRef.current,
    fabric: () => fabricRef.current,

    addText(preset = "body") {
      const fabric = fabricRef.current;
      const c = canvasRef.current;
      if (!fabric || !c) return;
      const presets = {
        heading: { text: "Add a heading", fontSize: 64, fontWeight: "bold" },
        subheading: { text: "Add a subheading", fontSize: 40, fontWeight: "600" },
        body: { text: "Add body text", fontSize: 28, fontWeight: "normal" },
      }[preset];
      const dw = designRef.current.width;
      const dh = designRef.current.height;
      const tb = new fabric.Textbox(presets.text, {
        left: dw / 2 - Math.min(400, dw * 0.7) / 2,
        top: dh / 2 - 40,
        width: Math.min(400, dw * 0.7),
        fontSize: presets.fontSize,
        fontWeight: presets.fontWeight,
        fontFamily: "Arial",
        fill: "#111827",
        textAlign: "center",
      });
      c.add(tb);
      c.setActiveObject(tb);
      c.renderAll();
    },

    addShape(kind) {
      const fabric = fabricRef.current;
      const c = canvasRef.current;
      if (!fabric || !c) return;
      const cx = designRef.current.width / 2;
      const cy = designRef.current.height / 2;
      let obj: FObject;
      if (kind === "circle") obj = new fabric.Circle({ radius: 120, fill: "#6366f1", left: cx - 120, top: cy - 120 });
      else if (kind === "triangle") obj = new fabric.Triangle({ width: 240, height: 210, fill: "#6366f1", left: cx - 120, top: cy - 105 });
      else if (kind === "line") obj = new fabric.Line([cx - 150, cy, cx + 150, cy], { stroke: "#6366f1", strokeWidth: 6 });
      else {
        const rx = kind === "pill" ? 60 : kind === "rounded" ? 20 : 0;
        obj = new fabric.Rect({ width: 280, height: kind === "pill" ? 120 : 220, rx, ry: rx, fill: "#6366f1", left: cx - 140, top: cy - 110 });
      }
      c.add(obj);
      c.setActiveObject(obj);
      c.renderAll();
    },

    async addImageUrl(url, name) {
      const fabric = fabricRef.current;
      const c = canvasRef.current;
      if (!fabric || !c) return;
      const img = await fabric.FabricImage.fromURL(url, { crossOrigin: "anonymous" });
      const dw = designRef.current.width;
      const dh = designRef.current.height;
      const maxW = dw * 0.6;
      const s = Math.min(1, maxW / (img.width ?? maxW));
      img.set({ scaleX: s, scaleY: s, left: (dw - (img.width ?? 0) * s) / 2, top: (dh - (img.height ?? 0) * s) / 2 });
      (img as unknown as { name?: string }).name = name ?? "image";
      c.add(img);
      c.setActiveObject(img);
      c.renderAll();
    },

    async duplicate() {
      const c = canvasRef.current;
      if (!c) return;
      const active = c.getActiveObject();
      if (!active) return;
      const clone = await active.clone();
      clone.set({ left: (active.left ?? 0) + 24, top: (active.top ?? 0) + 24 });
      c.add(clone);
      c.setActiveObject(clone);
      c.renderAll();
    },

    remove() {
      const c = canvasRef.current;
      if (!c) return;
      const objs = c.getActiveObjects();
      if (!objs.length) return;
      objs.forEach((o) => c.remove(o));
      c.discardActiveObject();
      c.renderAll();
    },

    reorder(dir) {
      const c = canvasRef.current;
      const obj = c?.getActiveObject();
      if (!c || !obj) return;
      if (dir === "up") c.bringObjectForward(obj);
      else if (dir === "down") c.sendObjectBackwards(obj);
      else if (dir === "top") c.bringObjectToFront(obj);
      else c.sendObjectToBack(obj);
      c.renderAll();
      snapshot();
    },

    toggleLock() {
      const c = canvasRef.current;
      const obj = c?.getActiveObject();
      if (!c || !obj) return;
      const locked = !obj.selectable;
      obj.set({ selectable: locked, evented: locked, lockMovementX: !locked, lockMovementY: !locked, lockScalingX: !locked, lockScalingY: !locked, lockRotation: !locked, hasControls: locked });
      if (!locked) c.discardActiveObject();
      c.renderAll();
      snapshot();
    },

    toggleVisible(obj) {
      const c = canvasRef.current;
      const target = obj ?? c?.getActiveObject();
      if (!c || !target) return;
      target.set("visible", !target.visible);
      c.renderAll();
      snapshot();
    },

    setProp(key, value) {
      const c = canvasRef.current;
      const obj = c?.getActiveObject();
      if (!c || !obj) return;
      obj.set(key as never, value as never);
      c.renderAll();
    },

    setBg,

    zoomIn() {
      const c = canvasRef.current;
      if (!c) return;
      applyZoom(Math.min(c.getZoom() * 1.25, 4));
    },
    zoomOut() {
      const c = canvasRef.current;
      if (!c) return;
      applyZoom(Math.max(c.getZoom() / 1.25, 0.1));
    },
    zoomFit,

    undo() {
      const c = canvasRef.current;
      const h = historyRef.current;
      if (!c || h.index <= 0) return;
      h.restoring = true;
      h.index -= 1;
      void c.loadFromJSON(h.stack[h.index]).then(() => {
        const meta = (c as unknown as { bgMeta?: BgMeta }).bgMeta;
        if (meta) bgMetaRef.current = meta;
        c.renderAll();
        h.restoring = false;
        setUndoLen(h.index);
        setRedoLen(h.stack.length - 1 - h.index);
        dirtyRef.current = true;
        setDirty(true);
        syncObjects();
      });
    },
    redo() {
      const c = canvasRef.current;
      const h = historyRef.current;
      if (!c || h.index >= h.stack.length - 1) return;
      h.restoring = true;
      h.index += 1;
      void c.loadFromJSON(h.stack[h.index]).then(() => {
        const meta = (c as unknown as { bgMeta?: BgMeta }).bgMeta;
        if (meta) bgMetaRef.current = meta;
        c.renderAll();
        h.restoring = false;
        setUndoLen(h.index);
        setRedoLen(h.stack.length - 1 - h.index);
        dirtyRef.current = true;
        setDirty(true);
        syncObjects();
      });
    },

    async save(note) {
      const c = canvasRef.current;
      if (!c || saving) return;
      setSaving(true);
      try {
        const json = JSON.stringify(c.toObject(["bgMeta"]));
        const updated = await designsApi.save(ws, designRef.current.id, { name, canvas_json: json, width: designRef.current.width, height: designRef.current.height, note });
        designRef.current = updated;
        // thumbnail — small render, best-effort
        const thumb = c.toDataURL({ format: "png", multiplier: Math.min(1, 480 / c.getWidth()) });
        const blob = await (await fetch(thumb)).blob();
        await designsApi.export(ws, updated.id, blob).catch(() => undefined);
        dirtyRef.current = false;
        setDirty(false);
        toast.success("Design saved");
      } catch (e) {
        toast.error("Save failed", e instanceof Error ? e.message : undefined);
      } finally {
        setSaving(false);
      }
    },

    async exportBlob(format) {
      const c = canvasRef.current;
      if (!c) throw new Error("Editor not ready");
      const mult = Math.max(1, designRef.current.width / c.getWidth());
      const dataUrl = c.toDataURL({ format: format === "jpeg" ? "jpeg" : "png", multiplier: mult, quality: format === "jpeg" ? 0.92 : undefined });
      return (await fetch(dataUrl)).blob();
    },

    async download(format) {
      try {
        const blob = await this.exportBlob(format);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${designRef.current.name || "design"}.${format === "jpeg" ? "jpg" : "png"}`;
        a.click();
        URL.revokeObjectURL(a.href);
        toast.success(`Exported ${format.toUpperCase()}`);
      } catch (e) {
        toast.error("Export failed", e instanceof Error ? e.message : undefined);
      }
    },

    selectObject(obj) {
      const c = canvasRef.current;
      if (!c) return;
      if (obj) {
        c.setActiveObject(obj);
      } else c.discardActiveObject();
      c.renderAll();
      setSel(obj);
    },
  };

  const api = apiRef.current;

  // ---------- version restore ----------
  const restoreVersion = useCallback(
    async (versionId: string) => {
      if (!ws) return;
      const updated = await designsApi.restore(ws, designRef.current.id, versionId);
      designRef.current = updated;
      const c = canvasRef.current;
      if (!c) return;
      historyRef.current.restoring = true;
      await c.loadFromJSON(updated.canvas_json);
      const meta = (c as unknown as { bgMeta?: BgMeta }).bgMeta;
      if (meta) bgMetaRef.current = meta;
      c.renderAll();
      historyRef.current.restoring = false;
      snapshot();
      toast.success("Version restored");
    },
    [ws, snapshot, toast],
  );

  const selected = sel;
  const isText = !!selected && ["textbox", "i-text", "text"].includes((selected.type ?? "").toLowerCase());

  return (
    <div className="-m-4 flex h-[calc(100vh-64px)] flex-col overflow-hidden bg-gray-100 dark:bg-[#0b0e17] sm:-m-6 lg:-m-8">
      {/* topbar */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-gray-200/80 bg-white px-3 dark:border-slate-800 dark:bg-[#10141f] sm:px-4">
        <button
          onClick={() => router.push("/studio")}
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <ChevronLeft className="h-4 w-4" /> Studio
        </button>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            dirtyRef.current = true;
            setDirty(true);
          }}
          className="w-40 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm font-semibold text-gray-900 transition-colors hover:border-gray-200 focus:border-brand-400 focus:outline-none dark:text-slate-100 dark:hover:border-slate-700 sm:w-56"
          aria-label="Design name"
        />
        {dirty && <span className="hidden text-xs text-amber-600 dark:text-amber-400 sm:block">Unsaved</span>}

        <div className="mx-1 hidden h-6 w-px bg-gray-200 dark:bg-slate-700 md:block" />
        <div className="hidden items-center gap-0.5 md:flex">
          <ToolBtn icon={<Undo2 className="h-4 w-4" />} label="Undo" onClick={() => api.undo()} disabled={undoLen <= 0} />
          <ToolBtn icon={<Redo2 className="h-4 w-4" />} label="Redo" onClick={() => api.redo()} disabled={redoLen <= 0} />
        </div>

        <div className="flex-1" />

        <div className="hidden items-center gap-0.5 rounded-lg bg-gray-100 px-1 dark:bg-slate-800 sm:flex">
          <ToolBtn icon={<ZoomOut className="h-4 w-4" />} label="Zoom out" onClick={() => api.zoomOut()} />
          <button onClick={() => api.zoomFit()} className="w-12 text-xs font-medium text-gray-600 hover:text-gray-900 dark:text-slate-300 dark:hover:text-white" title="Fit to screen">
            {zoomPct}%
          </button>
          <ToolBtn icon={<ZoomIn className="h-4 w-4" />} label="Zoom in" onClick={() => api.zoomIn()} />
        </div>

        <Button variant="outline" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => void api.download("png")}>
          <span className="hidden lg:inline">Export</span>
        </Button>
        <Button variant="outline" size="sm" icon={<Save className="h-4 w-4" />} loading={saving} onClick={() => void api.save()}>
          <span className="hidden lg:inline">Save</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          title="Save as reusable template"
          onClick={async () => {
            const tplName = window.prompt("Template name", `${designRef.current.name} template`);
            if (!tplName?.trim()) return;
            try {
              await api.save("Saved before templating");
              await templatesApi.create(ws, {
                name: tplName.trim(),
                category: "promotional",
                design_id: designRef.current.id,
              });
              toast.success("Saved as template", "Find it in the Studio library under “Yours”.");
            } catch (e) {
              toast.error("Couldn't save template", e instanceof Error ? e.message : undefined);
            }
          }}
        >
          <span className="hidden xl:inline">Save as template</span>
        </Button>
        <Button size="sm" icon={<Send className="h-4 w-4" />} onClick={() => setScheduleOpen(true)}>
          <span className="hidden sm:inline">Use in post</span>
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* left tool rail */}
        <div className="flex w-64 shrink-0 flex-col border-r border-gray-200/80 bg-white dark:border-slate-800 dark:bg-[#10141f]">
          <div className="flex gap-1 overflow-x-auto border-b border-gray-100 px-2 py-2 dark:border-slate-800">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                  tab === t.key
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                    : "text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {ready ? (
              <>
                {tab === "text" && <TextPanel api={api} />}
                {tab === "elements" && <ElementsPanel api={api} />}
                {tab === "uploads" && <UploadsPanel api={api} ws={ws} />}
                {tab === "background" && <BackgroundPanel api={api} current={bgMetaRef.current} />}
                {tab === "brand" && <BrandPanel api={api} ws={ws} />}
                {tab === "layers" && (
                  <LayersPanel objects={objects} selected={selected} api={api} />
                )}
                {tab === "versions" && <VersionsPanel ws={ws} designId={designRef.current.id} onRestore={restoreVersion} />}
              </>
            ) : (
              <p className="p-4 text-sm text-gray-400">Loading…</p>
            )}
          </div>
        </div>

        {/* canvas area */}
        <div ref={areaRef} className="relative min-w-0 flex-1 overflow-hidden">
          <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(circle, rgba(100,116,139,.18) 1px, transparent 1px)", backgroundSize: "18px 18px" }} />
          <canvas ref={canvasEl} className="absolute" />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
            </div>
          )}
        </div>

        {/* inspector */}
        <div className="hidden w-60 shrink-0 flex-col border-l border-gray-200/80 bg-white dark:border-slate-800 dark:bg-[#10141f] lg:flex">
          <div className="border-b border-gray-100 px-3 py-2.5 dark:border-slate-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">
              {selected ? `${isText ? "Text" : selected.type} properties` : "Selection"}
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {selected ? (
              <Inspector obj={selected} isText={isText} api={api} />
            ) : (
              <div className="space-y-3 text-sm text-gray-500 dark:text-slate-400">
                <p>Click an element on the canvas to edit it.</p>
                <div className="rounded-lg bg-gray-50 p-3 text-xs leading-relaxed dark:bg-slate-800/60">
                  <p className="font-medium text-gray-700 dark:text-slate-300">Canvas {designRef.current.width}×{designRef.current.height}</p>
                  <p className="mt-1">Delete · ⌘Z undo · ⌘D duplicate · ⌘S save</p>
                </div>
              </div>
            )}
          </div>
          {selected && (
            <div className="grid grid-cols-4 gap-1 border-t border-gray-100 p-2 dark:border-slate-800">
              <IconBtn icon={<ArrowUp className="h-4 w-4" />} title="Forward" onClick={() => api.reorder("up")} />
              <IconBtn icon={<ArrowDown className="h-4 w-4" />} title="Backward" onClick={() => api.reorder("down")} />
              <IconBtn icon={<Copy className="h-4 w-4" />} title="Duplicate" onClick={() => void api.duplicate()} />
              <IconBtn icon={<Trash2 className="h-4 w-4" />} title="Delete" onClick={() => api.remove()} danger />
            </div>
          )}
        </div>
      </div>

      <ScheduleModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        ws={ws}
        designName={designRef.current.name}
        exportBlob={api.exportBlob}
        designId={designRef.current.id}
      />
    </div>
  );
}

function ToolBtn({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    >
      {icon}
    </button>
  );
}

function IconBtn({ icon, title, onClick, danger }: { icon: React.ReactNode; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={cn(
        "rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800",
        danger && "hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400",
      )}
    >
      {icon}
    </button>
  );
}

// ---------- built-in background patterns (tiny canvas tiles) ----------

export function makePattern(kind: string, color: string) {
  const tile = document.createElement("canvas");
  const s = 28;
  tile.width = tile.height = s;
  const ctx = tile.getContext("2d")!;
  ctx.fillStyle = "transparent";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  switch (kind) {
    case "dots":
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "grid":
      ctx.globalAlpha = 0.5;
      ctx.strokeRect(0.5, 0.5, s, s);
      break;
    case "diagonal":
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(0, s);
      ctx.lineTo(s, 0);
      ctx.stroke();
      break;
    case "checker": {
      ctx.globalAlpha = 0.25;
      ctx.fillRect(0, 0, s / 2, s / 2);
      ctx.fillRect(s / 2, s / 2, s / 2, s / 2);
      break;
    }
    case "cross":
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(s / 2 - 5, s / 2);
      ctx.lineTo(s / 2 + 5, s / 2);
      ctx.moveTo(s / 2, s / 2 - 5);
      ctx.lineTo(s / 2, s / 2 + 5);
      ctx.stroke();
      break;
    default:
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
  }
  return tile;
}
