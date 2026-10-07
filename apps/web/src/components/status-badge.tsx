"use client";

import React from "react";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { ContentStatus, JobStatus, PostStatus } from "@/lib/types";

const MAP: Record<ContentStatus | PostStatus | JobStatus, { tone: BadgeTone; label: string }> = {
  draft: { tone: "gray", label: "Draft" },
  scheduled: { tone: "brand", label: "Scheduled" },
  publishing: { tone: "amber", label: "Publishing" },
  published: { tone: "green", label: "Published" },
  failed: { tone: "rose", label: "Failed" },
  cancelled: { tone: "gray", label: "Cancelled" },
  archived: { tone: "gray", label: "Archived" },
  pending: { tone: "amber", label: "Pending" },
  processing: { tone: "blue", label: "Processing" },
  success: { tone: "green", label: "Success" },
  dead: { tone: "rose", label: "Dead" },
};

export function StatusBadge({ status }: { status: keyof typeof MAP }) {
  const meta = MAP[status] ?? MAP.draft;
  return (
    <Badge tone={meta.tone} dot>
      {meta.label}
    </Badge>
  );
}
