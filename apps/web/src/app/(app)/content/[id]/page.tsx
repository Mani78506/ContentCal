"use client";

import { useParams } from "next/navigation";

import { ContentEditor } from "@/components/content/editor";
import { useApp } from "@/lib/app-context";

export default function EditContentPage() {
  const { workspace } = useApp();
  const params = useParams<{ id: string }>();
  if (!workspace) return null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Edit content</h1>
        <p className="mt-0.5 text-sm text-gray-500">Update the post, re-attach media, or adjust its schedule.</p>
      </div>
      <ContentEditor workspaceId={workspace.id} contentId={params.id} />
    </div>
  );
}
