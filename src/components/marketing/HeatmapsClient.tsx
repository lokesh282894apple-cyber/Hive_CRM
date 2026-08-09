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

/** Viewport heights used when tracker sends clientY (above-the-fold only). */
function viewportHeightForBreakpoint(bp: "mobile" | "tablet" | "desktop") {
  if (bp === "mobile") return 720;
  if (bp === "tablet") return 900;
  return 900;
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
  /** Full-page canvas height (scroll the panel to see below the fold). */
  const [pageHeight, setPageHeight] = useState(2800);

  useEffect(() => {
    setFrameFailed(false);
  }, [selectedPage, breakpoint]);

  const max = useMemo(
    () => Math.max(1, ...points.map((p) => p.click_count)),
    [points]
  );

  const width = breakpoint === "mobile" ? 390 : breakpoint === "tablet" ? 768 : 1200;
  const foldHeight = viewportHeightForBreakpoint(breakpoint);

  // Canvas must be tall so the iframe can render the full landing page.
  // Click dots currently use clientY (viewport coords) — they cluster in the first fold.
  const height = useMemo(() => {
    const fromClicks = Math.max(foldHeight + 40, ...points.map((p) => p.y_bucket + 80));
    return Math.max(pageHeight, fromClicks, 2400);
  }, [points, pageHeight, foldHeight]);

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
        <div className="mb-1 flex items-center gap-2 text-xs text-navy">
          <label className="label-field mb-0">Preview length</label>
          <select
            className="rounded-lg border border-border px-2 py-1"
            value={pageHeight}
            onChange={(e) => setPageHeight(Number(e.target.value))}
          >
            <option value={2000}>Short (~2k px)</option>
            <option value={2800}>Medium (~2.8k)</option>
            <option value={4000}>Tall (~4k)</option>
            <option value={6000}>Full landing (~6k)</option>
          </select>
        </div>
      </div>

      <div className="panel p-4">
        <p className="eyebrow mb-3">
          {selectedPage} · {points.length} buckets · max {max} clicks
        </p>
        <p className="mb-3 text-xs text-muted">
          Scroll inside the frame below to see the whole page. Orange dots are click hotspots.
          Today the website tracker sends <code className="text-[10px]">clientY</code> (viewport),
          so dots correctly map the <strong>first screen</strong> only — below-the-fold clicks need{" "}
          <code className="text-[10px]">pageY</code> on the tracker.
        </p>

        {points.length === 0 ? (
          <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-dashed border-border bg-slate-50 px-6 text-center text-sm text-muted">
            No heat dots for this breakpoint. Switch to{" "}
            <strong className="mx-1 text-navy">mobile</strong>
            (most phone traffic), or pick a top page with clicks.
          </div>
        ) : (
          <div
            className="mx-auto max-h-[75vh] overflow-auto rounded-xl border border-border bg-slate-100 shadow-sm"
            style={{ width, maxWidth: "100%" }}
          >
            <div className="relative" style={{ width, height }}>
              {showPage && iframeSrc && !frameFailed ? (
                <iframe
                  key={iframeSrc + breakpoint + height}
                  title="Page preview"
                  src={iframeSrc}
                  className="pointer-events-none absolute left-0 top-0 border-0 bg-white"
                  style={{ width, height }}
                  sandbox="allow-scripts allow-same-origin"
                  loading="lazy"
                  onError={() => setFrameFailed(true)}
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-b from-slate-50 to-slate-200" />
              )}

              <div className="pointer-events-none absolute inset-0 bg-navy/5" />

              {/* First-fold guide — where clientY dots can land */}
              <div
                className="pointer-events-none absolute left-0 right-0 z-[1] border-b border-dashed border-gold/60"
                style={{ top: foldHeight }}
                title="Viewport fold — dots above this line with current tracker"
              />
              <span
                className="pointer-events-none absolute left-2 z-[1] rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-muted"
                style={{ top: foldHeight + 4 }}
              >
                First screen ends ≈ here (tracker uses viewport Y)
              </span>

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
                <div className="sticky bottom-3 z-[3] mx-3 mb-3 rounded-lg bg-white/90 px-3 py-2 text-xs text-muted shadow">
                  Page preview unavailable.{" "}
                  <a
                    href={iframeSrc || selectedPage}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-periwinkle"
                  >
                    Open page
                  </a>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
