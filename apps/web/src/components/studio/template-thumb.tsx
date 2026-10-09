"use client";

import React, { useEffect, useRef, useState } from "react";

/** Renders a Fabric canvas JSON document as a static, scaled thumbnail. */

const canvasCache = new Map<string, Promise<typeof import("fabric")>>();

export function loadFabric() {
  let p = canvasCache.get("fabric");
  if (!p) {
    p = import("fabric");
    canvasCache.set("fabric", p);
  }
  return p;
}

export function TemplateThumb({
  canvasJson,
  width,
  height,
  className,
}: {
  canvasJson: string | null | undefined;
  width: number;
  height: number;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!canvasJson || !hostRef.current) return;
    let disposed = false;
    let canvas: import("fabric").StaticCanvas | null = null;

    (async () => {
      try {
        const fabric = await loadFabric();
        if (disposed || !hostRef.current) return;
        const el = document.createElement("canvas");
        hostRef.current.innerHTML = "";
        hostRef.current.appendChild(el);
        canvas = new fabric.StaticCanvas(el, { enableRetinaScaling: false });
        const doc = JSON.parse(canvasJson);
        await canvas.loadFromJSON(doc);
        if (disposed) return;
        const w = hostRef.current.clientWidth || 240;
        const scale = Math.min(w / width, (w * (height / width)) / height || 1);
        canvas.setZoom(scale);
        canvas.setDimensions({ width: width * scale, height: height * scale });
        canvas.renderAll();
      } catch {
        if (!disposed) setError(true);
      }
    })();

    return () => {
      disposed = true;
      try {
        canvas?.dispose();
      } catch {
        /* noop */
      }
    };
  }, [canvasJson, width, height]);

  if (error || !canvasJson) {
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br from-brand-500/20 to-violet-500/20 ${className ?? ""}`}>
        <span className="text-2xl font-bold text-brand-400">Aa</span>
      </div>
    );
  }
  return <div ref={hostRef} className={className} style={{ aspectRatio: `${width}/${height}` }} />;
}
