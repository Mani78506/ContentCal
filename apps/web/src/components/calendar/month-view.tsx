"use client";

import { useDroppable } from "@dnd-kit/core";
import { addDays, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek } from "date-fns";
import React, { useMemo } from "react";

import { EventChip } from "@/components/calendar/event-chip";
import type { CalendarEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function DayCell({
  day,
  currentMonth,
  events,
  onOpen,
}: {
  day: Date;
  currentMonth: Date;
  events: CalendarEvent[];
  onOpen: (e: CalendarEvent) => void;
}) {
  const key = format(day, "yyyy-MM-dd");
  const { setNodeRef, isOver } = useDroppable({ id: `day-${key}`, data: { day } });
  const dayEvents = useMemo(
    () =>
      events
        .filter((e) => isSameDay(new Date(e.scheduled_at), day))
        .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)),
    [events, day],
  );
  const inMonth = isSameMonth(day, currentMonth);
  const today = isToday(day);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[104px] flex-col gap-1 border-b border-r border-gray-100 p-1.5 transition-colors duration-150",
        !inMonth && "bg-gray-50/50",
        isOver && "bg-brand-50/70 ring-2 ring-inset ring-brand-400",
      )}
    >
      <div className="flex items-center justify-between px-1">
        <span
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
            today ? "bg-brand-600 text-white shadow-glow" : inMonth ? "text-gray-700" : "text-gray-400",
          )}
        >
          {format(day, "d")}
        </span>
        {dayEvents.length > 2 && <span className="text-[10px] font-medium text-gray-400">{dayEvents.length} posts</span>}
      </div>
      <div className="flex flex-col gap-1">
        {dayEvents.slice(0, 3).map((event) => (
          <EventChip key={event.id} event={event} time={format(new Date(event.scheduled_at), "HH:mm")} onOpen={onOpen} />
        ))}
        {dayEvents.length > 3 && (
          <span className="px-1 text-[10px] font-medium text-gray-400">+{dayEvents.length - 3} more</span>
        )}
      </div>
    </div>
  );
}

export function MonthView({
  cursor,
  events,
  onOpen,
}: {
  cursor: Date;
  events: CalendarEvent[];
  onOpen: (e: CalendarEvent) => void;
}) {
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    const out: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
    return out;
  }, [cursor]);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-soft">
      <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/70">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => (
          <DayCell key={day.toISOString()} day={day} currentMonth={cursor} events={events} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}
