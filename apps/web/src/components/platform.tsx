"use client";

import { Facebook, FlaskConical, Instagram, Linkedin, Twitter, Youtube } from "lucide-react";
import React from "react";

import { cn } from "@/lib/utils";
import type { ProviderKey } from "@/lib/types";

interface PlatformMeta {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  chip: string; // bg classes for the icon chip
}

export const PLATFORMS: Record<ProviderKey, PlatformMeta> = {
  instagram: { label: "Instagram", icon: Instagram, chip: "bg-gradient-to-tr from-amber-400 via-rose-500 to-violet-500 text-white" },
  facebook: { label: "Facebook", icon: Facebook, chip: "bg-[#1877F2] text-white" },
  youtube: { label: "YouTube", icon: Youtube, chip: "bg-[#FF0000] text-white" },
  linkedin: { label: "LinkedIn", icon: Linkedin, chip: "bg-[#0A66C2] text-white" },
  x: { label: "X", icon: Twitter, chip: "bg-gray-900 text-white" },
  mock: { label: "Mock (dev)", icon: FlaskConical, chip: "bg-gray-200 text-gray-600" },
};

export function PlatformIcon({ provider, size = "md", className }: { provider: ProviderKey; size?: "sm" | "md" | "lg"; className?: string }) {
  const meta = PLATFORMS[provider] ?? PLATFORMS.mock;
  const Icon = meta.icon;
  const dims = size === "sm" ? "h-5 w-5 [&_svg]:h-3 [&_svg]:w-3" : size === "lg" ? "h-10 w-10 [&_svg]:h-5 [&_svg]:w-5" : "h-7 w-7 [&_svg]:h-4 [&_svg]:w-4";
  return (
    <span title={meta.label} className={cn("inline-flex shrink-0 items-center justify-center rounded-lg", dims, meta.chip, className)}>
      <Icon />
    </span>
  );
}
