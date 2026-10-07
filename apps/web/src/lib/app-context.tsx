"use client";

import { useRouter } from "next/navigation";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";
import type { User, Workspace } from "@/lib/types";

const STORAGE_KEY = "contentcal.activeWorkspace";

interface AppState {
  user: User | null;
  workspaces: Workspace[];
  workspace: Workspace | null;
  loading: boolean;
  bootstrap: () => Promise<void>;
  switchWorkspace: (id: string) => void;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    try {
      const [me, wss] = await Promise.all([api.get<User>("/api/v1/auth/me"), api.get<Workspace[]>("/api/v1/workspaces")]);
      setUser(me);
      setWorkspaces(wss);
      const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      setActiveId(wss.find((w) => w.id === stored)?.id ?? wss[0]?.id ?? null);
    } catch {
      // 401 = simply logged out (public pages hit this on every load);
      // network/API-down also resolves to logged-out, pages guard themselves.
      setUser(null);
      setWorkspaces([]);
      setActiveId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const switchWorkspace = useCallback((id: string) => {
    setActiveId(id);
    window.localStorage.setItem(STORAGE_KEY, id);
    router.refresh();
  }, [router]);

  const logout = useCallback(async () => {
    await api.post("/api/v1/auth/logout").catch(() => undefined);
    setUser(null);
    setWorkspaces([]);
    setActiveId(null);
    router.push("/login");
  }, [router]);

  const value = useMemo<AppState>(
    () => ({
      user,
      workspaces,
      workspace: workspaces.find((w) => w.id === activeId) ?? null,
      loading,
      bootstrap,
      switchWorkspace,
      logout,
    }),
    [user, workspaces, activeId, loading, bootstrap, switchWorkspace, logout],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
