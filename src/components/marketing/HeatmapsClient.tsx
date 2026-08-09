"use client";

import type { HeatmapPoint } from "@/types/database";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

function previewUrl(pageUrl: string): string {
  try {
    const u = new URL(pageUrl);
    u.hash = "";
    return u.toString();
  } catch {
    return pageUrl.split("#")[0];
  }
}

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
  const [showPage, setShowPage] = useState(true);
  const [frameFailed, setFrameFailed] = useState(false);

  useEffect(() => {
    setFrameFailed(false);
  }, [selectedPage, breakpoint]);

  const max = useMemo(
    () => Math.max(1, ...points.map((p) => p.click_count)),
    [points]
  );

  const width = breakpoint === "mobile" ? 390 : breakpoint === "tablet" ? 768 : 1200;
  const height = useMemo(() => {
    const maxY = Math.max(900, ...points.map((p) => p.y_bucket + 80));
    return Math.min(3200, maxY);
  }, [points]);

  const iframeSrc = selectedPage ? previewUrl(selectedPage) : "";

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
        <label className="mb-1 flex cursor-pointer items-center gap-2 text-xs text-navy">
          <input
            type="checkbox"
            checked={showPage}
            onChange={(e) => setShowPage(e.target.checked)}
          />
          Show page behind dots
        </label>
      </div>

      <div className="panel overflow-auto p-4">
        <p className="eyebrow mb-3">
          {selectedPage} · {points.length} buckets · max {max} clicks
        </p>
        <p className="mb-3 text-xs text-muted">
          Orange dots = click density. Toggle the page preview under the dots. If the site blocks
          embedding, you&apos;ll still see dots on a blank canvas — open the page in a new tab to
          compare.
        </p>

        {points.length === 0 ? (
          <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-dashed border-border bg-slate-50 px-6 text-center text-sm text-muted">
            No heat dots for this breakpoint. Switch to <strong className="mx-1 text-navy">mobile</strong>
            (most phone traffic), or pick a top page with clicks.
          </div>
        ) : (
          <div
            className="relative mx-auto overflow-hidden rounded-xl border border-border bg-slate-100 shadow-sm"
            style={{ width, height, maxWidth: "100%" }}
          >
            {showPage && iframeSrc && !frameFailed ? (
              <iframe
                key={iframeSrc + breakpoint}
                title="Page preview"
                src={iframeSrc}
                className="pointer-events-none absolute inset-0 h-full w-full border-0 bg-white"
                sandbox="allow-scripts allow-same-origin"
                loading="lazy"
                onError={() => setFrameFailed(true)}
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-b from-slate-50 to-slate-200" />
            )}

            {/* Soft veil so dots stay visible on busy pages */}
            <div className="pointer-events-none absolute inset-0 bg-navy/5" />

            {points.map((p) => {
              const intensity = p.click_count / max;
              const size = 14 + intensity * 22;
              return (
                <div
                  key={`${p.x_bucket}-${p.y_bucket}-${p.viewport_breakpoint}`}
                  title={`${p.click_count} clicks @ (${p.x_bucket}, ${p.y_bucket})`}
                  className="pointer-events-none absolute rounded-full"
                  style={{
                    left: p.x_bucket,
                    top: p.y_bucket,
                    width: size,
                    height: size,
                    transform: "translate(-50%, -50%)",
                    background: `radial-gradient(circle, rgba(255,90,40,${0.55 + intensity * 0.4}) 0%, rgba(255,40,20,${0.25 + intensity * 0.35}) 55%, transparent 70%)`,
                    boxShadow: `0 0 ${10 + intensity * 20}px rgba(255, 60, 20, ${0.35 + intensity * 0.45})`,
                    zIndex: 2,
                  }}
                />
              );
            })}

            {frameFailed || (showPage && !iframeSrc) ? (
              <div className="absolute bottom-3 left-3 right-3 z-[3] rounded-lg bg-white/90 px-3 py-2 text-xs text-muted shadow">
                Page preview unavailable (site may block iframes).{" "}
                <a
                  href={iframeSrc || selectedPage}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-periwinkle"
                >
                  Open page
                </a>{" "}
                — dots still map click positions.
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
