"use client";

import { ContentEditor } from "@/components/content/editor";
import { useApp } from "@/lib/app-context";

export default function NewContentPage() {
  const { workspace } = useApp();
  if (!workspace) return null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">New content</h1>
        <p className="mt-0.5 text-sm text-gray-500">Write it once, publish it everywhere.</p>
      </div>
      <ContentEditor workspaceId={workspace.id} />
    </div>
  );
}
