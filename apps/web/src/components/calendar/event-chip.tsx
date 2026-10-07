"use client";

import { useDraggable } from "@dnd-kit/core";
import { motion } from "framer-motion";
import React from "react";

import { PlatformIcon } from "@/components/platform";
import type { CalendarEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_RING: Record<string, string> = {
  scheduled: "border-l-brand-500 hover:bg-brand-50/80",
  publishing: "border-l-amber-500 hover:bg-amber-50/80",
  published: "border-l-emerald-500 hover:bg-emerald-50/80",
  failed: "border-l-rose-500 hover:bg-rose-50/80",
};

export function EventChip({
  event,
  time,
  onOpen,
  draggable = true,
}: {
  event: CalendarEvent;
  time: string;
  onOpen: (event: CalendarEvent) => void;
  draggable?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: event.id,
    data: { event },
    disabled: !draggable || event.status === "published",
  });

  return (
    <motion.button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      layout
      onClick={() => !isDragging && onOpen(event)}
      style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined}
      whileHover={{ scale: 1.015 }}
      className={cn(
        "group flex w-full items-center gap-1.5 rounded-md border border-gray-200/70 border-l-[3px] bg-white px-1.5 py-1 text-left shadow-sm transition-colors",
        STATUS_RING[event.status] ?? "border-l-gray-300 hover:bg-gray-50",
        isDragging && "z-30 opacity-90 shadow-lift ring-2 ring-brand-400",
        event.status === "published" ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
      )}
      aria-label={`${event.title}, ${event.status}, ${time}`}
    >
      <PlatformIcon provider={event.provider} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-medium leading-tight text-gray-800">{event.title}</span>
        <span className="block text-[10px] leading-tight text-gray-400">{time}</span>
      </span>
      {event.thumbnail_path && event.thumbnail_mime?.startsWith("image/") && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.thumbnail_path} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />
      )}
    </motion.button>
  );
}
