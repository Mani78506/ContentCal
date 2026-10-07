"use client";

import { BarChart3, TrendingUp } from "lucide-react";
import React from "react";

import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Analytics is intentionally an honest placeholder: no fake charts, no
 * made-up numbers. The page documents exactly what will arrive and what it
 * requires (real platform APIs + a metrics ingestion job).
 */
export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Analytics</h1>
        <p className="mt-0.5 text-sm text-gray-500">Performance across every channel — coming in a later milestone.</p>
      </div>

      <EmptyState
        className="bg-white py-20"
        icon={<BarChart3 />}
        title="Analytics isn’t built yet"
        description="Real reach, engagement, and growth metrics require live platform APIs. We won’t show placeholder numbers here — when this ships, every figure will come from your actual connected accounts."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { title: "Reach & impressions", body: "Per-post and per-channel reach pulled from official platform insights APIs." },
          { title: "Engagement", body: "Likes, comments, shares, and saves, tracked over time with trend lines." },
          { title: "Best time to post", body: "Scheduling recommendations learned from your own audience data." },
        ].map((item) => (
          <Card key={item.title} className="p-5 opacity-80">
            <div className="flex items-center gap-2 text-brand-600">
              <TrendingUp className="h-4 w-4" />
              <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">{item.body}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="What unlocks this" />
        <ul className="list-disc space-y-1.5 px-5 py-4 pl-10 text-sm text-gray-500">
          <li>OAuth connections to real platforms (Instagram Graph, YouTube Data, LinkedIn, …)</li>
          <li>A scheduled metrics-ingestion job in the worker</li>
          <li>A metrics warehouse table alongside the publishing schema</li>
        </ul>
      </Card>
    </div>
  );
}
