import { clsx, type ClassValue } from "clsx";
import { format, formatDistanceToNow, isToday, isTomorrow, parseISO } from "date-fns";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function smartDate(iso: string): string {
  const d = parseISO(iso);
  if (isToday(d)) return `Today, ${format(d, "HH:mm")}`;
  if (isTomorrow(d)) return `Tomorrow, ${format(d, "HH:mm")}`;
  return format(d, "MMM d, HH:mm");
}

export function relative(iso: string): string {
  return formatDistanceToNow(parseISO(iso), { addSuffix: true });
}

export function fullDate(iso: string): string {
  return format(parseISO(iso), "EEEE, MMM d yyyy · HH:mm");
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
