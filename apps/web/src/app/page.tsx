"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useApp } from "@/lib/app-context";

export default function Home() {
  const router = useRouter();
  const { user, loading } = useApp();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/dashboard" : "/login");
  }, [user, loading, router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
    </div>
  );
}
