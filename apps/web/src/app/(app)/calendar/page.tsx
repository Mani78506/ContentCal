"use client";

import { DndContext, DragEndEvent, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import React, { useCallback, useMemo, useState } from "react";
import useSWR from "swr";

import { DayView, WeekView } from "@/components/calendar/week-view";
import { EventModal } from "@/components/calendar/event-modal";
import { EventChip } from "@/components/calendar/event-chip";
import { MonthView } from "@/components/calendar/month-view";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { api, ApiError, swrFetcher } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import type { CalendarEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

type View = "month" | "week" | "day";

function rangeFor(view: View, cursor: Date): [Date, Date] {
  if (view === "month") {
    // cover the full spilled grid, not just the named month
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return [start, end];
  }
  if (view === "week") {
    return [startOfWeek(cursor, { weekStartsOn: 1 }), endOfWeek(cursor, { weekStartsOn: 1 })];
  }
  const start = new Date(cursor);
  start.setHours(0, 0, 0, 0);
  return [start, addDays(start, 1)];
}

const VIEW_LABEL: Record<View, string> = { month: "Month", week: "Week", day: "Day" };

export default function CalendarPage() {
  const { workspace } = useApp();
  const toast = useToast();
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [dragEvent, setDragEvent] = useState<CalendarEvent | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const [start, end] = rangeFor(view, cursor);
  const key = workspace
    ? `/api/v1/workspaces/${workspace.id}/calendar?start=${start.toISOString()}&end=${end.toISOString()}`
    : null;

  const { data: events, isLoading, mutate } = useSWR<CalendarEvent[]>(key, swrFetcher, {
    refreshInterval: 30_000,
  });

  const shift = useCallback(
    (dir: 1 | -1) => {
      setCursor((c) => (view === "month" ? addMonths(c, dir) : view === "week" ? addWeeks(c, dir) : addDays(c, dir)));
    },
    [view],
  );

  const headline = useMemo(() => {
    if (view === "month") return format(cursor, "MMMM yyyy");
    if (view === "week") {
      const s = startOfWeek(cursor, { weekStartsOn: 1 });
      return `${format(s, "MMM d")} – ${format(addDays(s, 6), "MMM d, yyyy")}`;
    }
    return format(cursor, "EEEE, MMM d yyyy");
  }, [view, cursor]);

  async function onDragEnd(e: DragEndEvent) {
    const event = e.active.data.current?.event as CalendarEvent | undefined;
    setDragEvent(null);
    const targetDay = e.over?.data.current?.day as Date | undefined;
    if (!event || !targetDay || !workspace) return;
    const original = new Date(event.scheduled_at);
    if (isSameDay(original, targetDay)) return;

    const moved = new Date(targetDay);
    moved.setHours(original.getHours(), original.getMinutes(), 0, 0);
    try {
      await api.patch(`/api/v1/workspaces/${workspace.id}/scheduled-posts/${event.id}`, { scheduled_at: moved.toISOString() });
      toast.success("Post moved", `${event.title} → ${format(moved, "MMM d, HH:mm")}`);
      void mutate();
    } catch (err) {
      toast.error("Couldn’t move post", err instanceof ApiError ? err.message : "Please try again.");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Content calendar</h1>
          <p className="mt-0.5 text-sm text-gray-500">Drag posts between days to reschedule.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm" role="tablist" aria-label="Calendar view">
            {(Object.keys(VIEW_LABEL) as View[]).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all duration-150",
                  view === v ? "bg-brand-600 text-white shadow-sm" : "text-gray-600 hover:text-gray-900",
                )}
              >
                {VIEW_LABEL[v]}
              </button>
            ))}
          </div>
          <div className="flex items-center rounded-xl border border-gray-200 bg-white shadow-sm">
            <button onClick={() => shift(-1)} className="rounded-l-xl p-2.5 text-gray-500 transition-colors hover:bg-gray-50" aria-label="Previous">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => setCursor(new Date())} className="border-x border-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
              Today
            </button>
            <button onClick={() => shift(1)} className="rounded-r-xl p-2.5 text-gray-500 transition-colors hover:bg-gray-50" aria-label="Next">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <Link href="/content/new">
            <Button size="sm" icon={<Plus className="h-4 w-4" />}>
              New post
            </Button>
          </Link>
        </div>
      </div>

      <h2 className="text-lg font-semibold text-gray-800">{headline}</h2>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-[520px] w-full rounded-2xl" />
        </div>
      ) : (events ?? []).length === 0 ? (
        <EmptyState
          className="bg-white"
          icon={<CalendarDays />}
          title="This period is wide open"
          description="No posts are scheduled in this range. Create content and pick a time to fill your calendar."
          action={
            <Link href="/content/new">
              <Button icon={<Plus className="h-4 w-4" />}>Create a post</Button>
            </Link>
          }
        />
      ) : (
        <DndContext sensors={sensors} onDragStart={(e) => setDragEvent((e.active.data.current?.event as CalendarEvent) ?? null)} onDragEnd={onDragEnd} onDragCancel={() => setDragEvent(null)}>
          {view === "month" && <MonthView cursor={cursor} events={events ?? []} onOpen={setSelected} />}
          {view === "week" && <WeekView cursor={cursor} events={events ?? []} onOpen={setSelected} />}
          {view === "day" && <DayView cursor={cursor} events={events ?? []} onOpen={setSelected} />}
          <DragOverlay dropAnimation={null}>
            {dragEvent && (
              <div className="w-44 rotate-2 opacity-95">
                <EventChip event={dragEvent} time={format(new Date(dragEvent.scheduled_at), "HH:mm")} onOpen={() => {}} draggable={false} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {workspace && selected && (
        <EventModal event={selected} workspaceId={workspace.id} onClose={() => setSelected(null)} onChanged={() => void mutate()} />
      )}
    </div>
  );
}
