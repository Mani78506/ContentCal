"use client";

import { addDays, format, isSameDay, isToday, startOfWeek } from "date-fns";
import React, { useMemo } from "react";

import { EventChip } from "@/components/calendar/event-chip";
import type { CalendarEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

export function WeekView({
  cursor,
  events,
  onOpen,
}: {
  cursor: Date;
  events: CalendarEvent[];
  onOpen: (e: CalendarEvent) => void;
}) {
  const days = useMemo(() => {
    const start = startOfWeek(cursor, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [cursor]);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-7">
      {days.map((day) => {
        const dayEvents = events
          .filter((e) => isSameDay(new Date(e.scheduled_at), day))
          .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
        return (
          <div
            key={day.toISOString()}
            className={cn(
              "min-h-[180px] rounded-2xl border bg-white p-2 shadow-soft",
              isToday(day) ? "border-brand-200 ring-1 ring-brand-100" : "border-gray-200",
            )}
          >
            <div className="mb-2 flex items-baseline justify-between px-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{format(day, "EEE")}</span>
              <span className={cn("text-sm font-bold", isToday(day) ? "text-brand-600" : "text-gray-700")}>{format(day, "d")}</span>
            </div>
            <div className="space-y-1.5">
              {dayEvents.map((event) => (
                <EventChip key={event.id} event={event} time={format(new Date(event.scheduled_at), "HH:mm")} onOpen={onOpen} />
              ))}
              {dayEvents.length === 0 && <p className="px-1.5 pt-2 text-xs text-gray-300">No posts</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DayView({
  cursor,
  events,
  onOpen,
}: {
  cursor: Date;
  events: CalendarEvent[];
  onOpen: (e: CalendarEvent) => void;
}) {
  const dayEvents = events
    .filter((e) => isSameDay(new Date(e.scheduled_at), cursor))
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-soft">
      <h3 className="text-lg font-semibold text-gray-900">{format(cursor, "EEEE, MMMM d")}</h3>
      <div className="mt-4 space-y-2">
        {dayEvents.length === 0 && <p className="py-10 text-center text-sm text-gray-400">Nothing scheduled for this day.</p>}
        {dayEvents.map((event) => (
          <div key={event.id} className="flex items-center gap-4">
            <span className="w-14 shrink-0 text-right text-xs font-semibold text-gray-500">
              {format(new Date(event.scheduled_at), "HH:mm")}
            </span>
            <div className="w-full max-w-md">
              <EventChip event={event} time={format(new Date(event.scheduled_at), "HH:mm")} onOpen={onOpen} draggable={false} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
