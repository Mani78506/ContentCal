/** API client. Same-origin (Next rewrites proxy /api + /media to FastAPI),
 * cookie-based auth — no tokens ever in JS storage. */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  refreshing ??= fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      setTimeout(() => (refreshing = null), 100);
    });
  return refreshing;
}

export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: "include",
      ...init,
      headers: {
        ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, "network_error", "Cannot reach the API. Is the backend running on :8010?");
  }

  if (res.status === 401 && !retried && !path.includes("/auth/")) {
    const ok = await tryRefresh();
    if (ok) return apiFetch<T>(path, init, true);
  }

  if (!res.ok) {
    let code = "error";
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      const detail = body?.detail;
      if (detail && typeof detail === "object") {
        code = detail.code ?? code;
        message = detail.message ?? message;
        if (Array.isArray(detail.errors) && detail.errors[0]?.msg) message = detail.errors[0].msg;
      } else if (typeof detail === "string") {
        message = detail;
      }
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, code, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T,>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
  upload: <T,>(path: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<T>(path, { method: "POST", body: form });
  },
};

/** Typed SWR fetcher: useSWR<MyType>(key, swrFetcher) */
export const swrFetcher = <T,>(path: string) => api.get<T>(path);
