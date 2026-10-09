/** Studio API helpers — templates, designs, library, brand kits, activity. */

import { api } from "@/lib/api";
import type {
  ActivityItem,
  BrandKit,
  Design,
  DesignSummary,
  DesignVersion,
  LibraryAsset,
  Template,
  TemplateCategory,
} from "@/lib/types";

export function wsBase(workspaceId: string) {
  return `/api/v1/workspaces/${workspaceId}`;
}

// ---------- Templates ----------

export const templatesApi = {
  list: (ws: string, opts: { category?: TemplateCategory; q?: string; favorites?: boolean } = {}) => {
    const params = new URLSearchParams();
    if (opts.category) params.set("category", opts.category);
    if (opts.q) params.set("q", opts.q);
    if (opts.favorites) params.set("favorites", "true");
    const qs = params.toString();
    return api.get<{ items: Template[]; total: number }>(`${wsBase(ws)}/studio/templates${qs ? `?${qs}` : ""}`);
  },
  recent: (ws: string) => api.get<Template[]>(`${wsBase(ws)}/studio/templates/recent`),
  get: (ws: string, id: string) => api.get<Template>(`${wsBase(ws)}/studio/templates/${id}`),
  create: (ws: string, body: { name: string; category: TemplateCategory; platform?: string; design_id?: string; canvas_json?: string; width?: number; height?: number }) =>
    api.post<Template>(`${wsBase(ws)}/studio/templates`, body),
  update: (ws: string, id: string, body: { name?: string; category?: TemplateCategory; canvas_json?: string; thumbnail_path?: string }) =>
    api.patch<Template>(`${wsBase(ws)}/studio/templates/${id}`, body),
  remove: (ws: string, id: string) => api.del(`${wsBase(ws)}/studio/templates/${id}`),
  favorite: (ws: string, id: string, fav: boolean) =>
    apiFetch204(`${wsBase(ws)}/studio/templates/${id}/favorite`, fav ? "POST" : "DELETE"),
};

// ---------- Designs ----------

export const designsApi = {
  list: (ws: string) => api.get<{ items: DesignSummary[]; total: number }>(`${wsBase(ws)}/studio/designs`),
  get: (ws: string, id: string) => api.get<Design>(`${wsBase(ws)}/studio/designs/${id}`),
  create: (ws: string, body: { name: string; width: number; height: number; canvas_json?: string; template_id?: string }) =>
    api.post<Design>(`${wsBase(ws)}/studio/designs`, body),
  save: (ws: string, id: string, body: { name?: string; canvas_json?: string; width?: number; height?: number; note?: string }) =>
    api.patch<Design>(`${wsBase(ws)}/studio/designs/${id}`, body),
  remove: (ws: string, id: string) => api.del(`${wsBase(ws)}/studio/designs/${id}`),
  versions: (ws: string, id: string) => api.get<DesignVersion[]>(`${wsBase(ws)}/studio/designs/${id}/versions`),
  versionCanvas: (ws: string, id: string, versionId: string) =>
    api.get<{ id: string; canvas_json: string; width: number; height: number; note: string }>(
      `${wsBase(ws)}/studio/designs/${id}/versions/${versionId}`,
    ),
  restore: (ws: string, id: string, versionId: string) =>
    api.post<Design>(`${wsBase(ws)}/studio/designs/${id}/restore`, { version_id: versionId }),
  /** Upload the rendered PNG/JPG; pass contentId to also attach to a post. */
  export: (ws: string, id: string, blob: Blob, contentId?: string) => {
    const form = new FormData();
    const mime = blob.type === "image/jpeg" ? "jpeg" : "png";
    form.append("file", blob, `design.${mime === "jpeg" ? "jpg" : "png"}`);
    if (contentId) form.append("content_id", contentId);
    return fetch(`${wsBase(ws)}/studio/designs/${id}/export`, {
      method: "POST",
      credentials: "include",
      body: form,
    }).then(async (r) => {
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b?.detail?.message ?? `Export failed (${r.status})`);
      }
      return r.json() as Promise<{ export_url: string; asset: LibraryAsset; content_media_id: string | null }>;
    });
  },
};

// ---------- Media library ----------

export const libraryApi = {
  list: (ws: string, opts: { folder?: string; q?: string; mime?: "image" | "video"; kind?: string } = {}) => {
    const params = new URLSearchParams();
    if (opts.folder !== undefined) params.set("folder", opts.folder);
    if (opts.q) params.set("q", opts.q);
    if (opts.mime) params.set("mime", opts.mime);
    if (opts.kind) params.set("kind", opts.kind);
    const qs = params.toString();
    return api.get<{ items: LibraryAsset[]; total: number }>(`${wsBase(ws)}/library/assets${qs ? `?${qs}` : ""}`);
  },
  folders: (ws: string) => api.get<string[]>(`${wsBase(ws)}/library/folders`),
  update: (ws: string, id: string, body: { folder?: string; file_name?: string }) =>
    api.patch<LibraryAsset>(`${wsBase(ws)}/library/assets/${id}`, body),
  remove: (ws: string, id: string) => api.del(`${wsBase(ws)}/library/assets/${id}`),
  attachToContent: (ws: string, contentId: string, assetId: string) =>
    api.post(`${wsBase(ws)}/content/${contentId}/media/from-asset`, { asset_id: assetId }),
  /** Upload with progress (XHR — fetch can't report upload progress). */
  upload: (ws: string, file: File, folder: string, onProgress?: (pct: number) => void) =>
    new Promise<LibraryAsset>((resolve, reject) => {
      const form = new FormData();
      form.append("file", file);
      form.append("folder", folder);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${wsBase(ws)}/library/assets`);
      xhr.withCredentials = true;
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
        else {
          try {
            reject(new Error(JSON.parse(xhr.responseText)?.detail?.message ?? `Upload failed (${xhr.status})`));
          } catch {
            reject(new Error(`Upload failed (${xhr.status})`));
          }
        }
      };
      xhr.onerror = () => reject(new Error("Upload failed — network error"));
      xhr.send(form);
    }),
};

// ---------- Brand kits ----------

export const brandKitsApi = {
  list: (ws: string) => api.get<BrandKit[]>(`${wsBase(ws)}/brand-kits`),
  create: (ws: string, body: { name: string; colors?: { name: string; hex: string }[]; fonts?: { name: string; family: string }[]; is_default?: boolean }) =>
    api.post<BrandKit>(`${wsBase(ws)}/brand-kits`, body),
  update: (ws: string, id: string, body: Partial<{ name: string; colors: { name: string; hex: string }[]; fonts: { name: string; family: string }[]; is_default: boolean }>) =>
    api.patch<BrandKit>(`${wsBase(ws)}/brand-kits/${id}`, body),
  remove: (ws: string, id: string) => api.del(`${wsBase(ws)}/brand-kits/${id}`),
  uploadAsset: (ws: string, kitId: string, file: File, kind: "logo" | "image") => {
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind);
    return fetch(`${wsBase(ws)}/brand-kits/${kitId}/assets`, { method: "POST", credentials: "include", body: form }).then(
      async (r) => {
        if (!r.ok) throw new Error("Brand asset upload failed");
        return r.json() as Promise<LibraryAsset>;
      },
    );
  },
};

// ---------- Activity ----------

export const activityApi = {
  list: (ws: string, action?: string) =>
    api.get<{ items: ActivityItem[]; total: number }>(
      `${wsBase(ws)}/activity${action ? `?action=${encodeURIComponent(action)}` : ""}`,
    ),
};

async function apiFetch204(path: string, method: string) {
  const res = await fetch(path, { method, credentials: "include" });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
}
