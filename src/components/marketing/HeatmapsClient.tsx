"use client";

import type { HeatmapPoint } from "@/types/database";
import Link from "next/link";
import { useMemo } from "react";

export function HeatmapsClient({
  pages,
  selectedPage,
  breakpoint,
  points,
}: {
  pages: string[];
  selectedPage: string;
  breakpoint: "mobile" | "tablet" | "desktop";
  points: HeatmapPoint[];
}) {
  const max = useMemo(
    () => Math.max(1, ...points.map((p) => p.click_count)),
    [points]
  );

  const width = breakpoint === "mobile" ? 390 : breakpoint === "tablet" ? 768 : 1200;
  const height = useMemo(() => {
    const maxY = Math.max(800, ...points.map((p) => p.y_bucket + 40));
    return Math.min(2400, maxY);
  }, [points]);

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label-field">Page</label>
          <div className="flex flex-wrap gap-2">
            {pages.map((p) => (
              <Link
                key={p}
                href={`/marketing/heatmaps?page=${encodeURIComponent(p)}&breakpoint=${breakpoint}`}
                className={
                  p === selectedPage
                    ? "btn-primary text-xs"
                    : "rounded-xl border border-border px-3 py-1.5 text-xs text-navy"
                }
              >
                {p.replace(/^https?:\/\//, "").slice(0, 48)}
              </Link>
            ))}
          </div>
        </div>
        <div>
          <label className="label-field">Breakpoint</label>
          <div className="flex gap-2">
            {(["mobile", "tablet", "desktop"] as const).map((bp) => (
              <Link
                key={bp}
                href={`/marketing/heatmaps?page=${encodeURIComponent(selectedPage)}&breakpoint=${bp}`}
                className={
                  bp === breakpoint
                    ? "btn-primary text-xs"
                    : "rounded-xl border border-border px-3 py-1.5 text-xs text-navy"
                }
              >
                {bp}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="panel overflow-auto p-4">
        <p className="eyebrow mb-3">
          {selectedPage} · {points.length} buckets · max {max} clicks
        </p>
        {points.length === 0 ? (
          <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-dashed border-border bg-slate-50 px-6 text-center text-sm text-muted">
            No heat dots for this breakpoint. Switch to mobile/tablet/desktop above, or pick a
            page with click traffic.
          </div>
        ) : (
          <div
            className="relative mx-auto rounded-xl border border-border bg-gradient-to-b from-slate-50 to-slate-100"
            style={{ width, height, maxWidth: "100%" }}
          >
            {points.map((p) => {
              const intensity = p.click_count / max;
              return (
                <div
                  key={`${p.x_bucket}-${p.y_bucket}`}
                  title={`${p.click_count} clicks @ (${p.x_bucket}, ${p.y_bucket})`}
                  className="absolute rounded-full"
                  style={{
                    left: p.x_bucket,
                    top: p.y_bucket,
                    width: 18,
                    height: 18,
                    transform: "translate(-50%, -50%)",
                    background: `rgba(255, 80, 40, ${0.15 + intensity * 0.75})`,
                    boxShadow: `0 0 ${8 + intensity * 16}px rgba(255, 60, 20, ${intensity * 0.6})`,
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
