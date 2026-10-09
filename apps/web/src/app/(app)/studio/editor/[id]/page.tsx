"use client";

import { useParams, useRouter } from "next/navigation";
import React from "react";
import useSWR from "swr";

import { useApp } from "@/lib/app-context";
import { designsApi } from "@/lib/studio";
import { DesignEditor } from "@/components/studio/editor";

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { workspace } = useApp();
  const ws = workspace?.id;

  const { data: design, error } = useSWR(ws && id ? `design:${ws}:${id}` : null, () => designsApi.get(ws!, id));

  if (!ws) return null;
  if (error) {
    router.replace("/studio");
    return null;
  }
  if (!design) {
    return (
      <div className="-m-4 flex h-[calc(100vh-64px)] items-center justify-center sm:-m-6 lg:-m-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
      </div>
    );
  }
  return <DesignEditor key={design.id} ws={ws} design={design} />;
}
