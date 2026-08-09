"use client";

import type { PageEvent, VisitorSession } from "@/types/database";
import { formatDateTime } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/Primitives";
import { MousePointer2, Eye, ArrowDown } from "lucide-react";

export type LeadMarketingData = {
  attribution: {
    first_touch_at: string | null;
    converted_at: string;
    first_touch_campaign: string | null;
    last_touch_campaign: string | null;
    first_touch_channel: string | null;
  } | null;
  session: VisitorSession | null;
  creativeName: string | null;
  events: PageEvent[];
  legacySource?: string | null;
};

function durationLabel(start: string | null | undefined, end: string | null | undefined) {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 0) return "—";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "<1 min";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}

function maxScroll(events: PageEvent[]): number {
  let max = 0;
  for (const ev of events) {
    if (ev.event_type !== "scroll_depth") continue;
    const m = String(ev.element_selector || "").match(/(\d+)/);
    if (m) max = Math.max(max, Number(m[1]));
    if (typeof ev.y === "number" && ev.y <= 100) max = Math.max(max, ev.y);
  }
  return max;
}

type TimelineItem =
  | { kind: "pageview_group"; page_url: string; page_title: string | null; count: number; at: string }
  | { kind: "event"; event: PageEvent };

function buildTimeline(events: PageEvent[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const ev of events) {
    if (ev.event_type === "pageview") {
      const last = items[items.length - 1];
      if (
        last &&
        last.kind === "pageview_group" &&
        last.page_url === ev.page_url
      ) {
        last.count += 1;
        continue;
      }
      items.push({
        kind: "pageview_group",
        page_url: ev.page_url,
        page_title: ev.page_title,
        count: 1,
        at: ev.occurred_at,
      });
    } else {
      items.push({ kind: "event", event: ev });
    }
  }
  return items;
}

export function LeadMarketingTab({ data }: { data: LeadMarketingData }) {
  const session = data.session;
  const attr = data.attribution;
  const events = data.events;
  const hasData = Boolean(attr || session);

  if (!hasData) {
    return (
      <div className="panel p-8">
        <p className="eyebrow">Marketing Box</p>
        <h2 className="mt-2 text-xl font-semibold text-navy">No website journey linked</h2>
        <p className="mt-2 max-w-xl text-sm text-muted">
          This lead has no <code className="text-xs">session_id</code> attribution yet. When the
          admissions form posts through the website proxy with the tracking cookie, first-touch
          campaign and page journey appear here — while you work them through the admissions
          stages on Info / Calling.
        </p>
        {data.legacySource ? (
          <p className="mt-4 text-sm text-navy">
            Legacy source field: <span className="font-semibold">{data.legacySource}</span>
          </p>
        ) : null}
      </div>
    );
  }

  const pageviews = events.filter((e) => e.event_type === "pageview").length;
  const clicks = events.filter((e) => e.event_type === "click").length;
  const scrollMax = maxScroll(events);
  const uniquePages = new Set(events.map((e) => e.page_url)).size;
  const timeline = buildTimeline(events);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="panel p-5">
          <p className="eyebrow">First touch</p>
          <p className="mt-2 text-lg font-semibold text-navy">
            {attr?.first_touch_campaign ?? "Unattributed"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {attr?.first_touch_channel ? `${attr.first_touch_channel} · ` : ""}
            {attr?.first_touch_at ? formatDateTime(attr.first_touch_at) : "—"}
          </p>
        </div>
        <div className="panel p-5">
          <p className="eyebrow">Last touch</p>
          <p className="mt-2 text-lg font-semibold text-navy">
            {attr?.last_touch_campaign ?? "—"}
          </p>
          <p className="mt-1 text-xs text-muted">
            Converted {attr?.converted_at ? formatDateTime(attr.converted_at) : "—"}
          </p>
        </div>
        <div className="panel p-5">
          <p className="eyebrow">Creative</p>
          <p className="mt-2 text-lg font-semibold text-navy">{data.creativeName ?? "—"}</p>
          {session?.matched_ad_creative_id ? (
            <StatusBadge label="Tracked /go slug" tone="blue" />
          ) : (
            <StatusBadge label="UTM / referrer" tone="gray" />
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip label={`${uniquePages} pages`} />
        <Chip label={`${pageviews} pageviews`} />
        <Chip label={`${clicks} clicks`} />
        <Chip label={`Scroll ${scrollMax || 0}%`} />
        <Chip
          label={durationLabel(
            session?.first_seen_at,
            attr?.converted_at ?? session?.last_seen_at
          )}
        />
        <Chip
          label={[session?.device_type, session?.os, session?.browser]
            .filter(Boolean)
            .join(" · ") || "Device —"}
        />
      </div>

      {session ? (
        <div className="panel p-5">
          <p className="eyebrow">UTM & session</p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            <Meta label="UTM source / medium" value={[session.utm_source, session.utm_medium].filter(Boolean).join(" / ") || "—"} />
            <Meta label="UTM campaign" value={session.utm_campaign ?? "—"} />
            <Meta label="UTM content / term" value={[session.utm_content, session.utm_term].filter(Boolean).join(" / ") || "—"} />
            <Meta label="Click id" value={session.click_id ?? "—"} />
            <Meta label="Entry page" value={session.entry_page_url ?? "—"} />
            <Meta label="Referrer" value={session.referrer_url ?? "—"} />
            <Meta label="First seen" value={formatDateTime(session.first_seen_at)} />
            <Meta label="Last seen" value={formatDateTime(session.last_seen_at)} />
            {data.legacySource ? <Meta label="Legacy source" value={data.legacySource} /> : null}
          </dl>
        </div>
      ) : null}

      <div className="panel overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <p className="eyebrow">Page journey</p>
        </div>
        {timeline.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No page events recorded for this session.</p>
        ) : (
          <ul className="divide-y divide-border">
            {timeline.map((item, idx) => {
              if (item.kind === "pageview_group") {
                return (
                  <li key={`pv-${idx}`} className="flex items-start gap-3 px-5 py-3">
                    <Eye className="mt-0.5 h-4 w-4 shrink-0 text-periwinkle" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge label="pageview" tone="blue" />
                        {item.count > 1 ? (
                          <span className="text-[11px] text-muted">×{item.count}</span>
                        ) : null}
                        <span className="truncate text-sm font-medium text-navy">
                          {item.page_title || item.page_url}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted">{item.page_url}</p>
                    </div>
                    <p className="shrink-0 text-xs text-muted">{formatDateTime(item.at)}</p>
                  </li>
                );
              }
              const ev = item.event;
              const Icon = ev.event_type === "click" ? MousePointer2 : ArrowDown;
              return (
                <li key={ev.id} className="flex items-start gap-3 px-5 py-3">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge
                        label={ev.event_type}
                        tone={ev.event_type === "click" ? "yellow" : "gray"}
                      />
                      <span className="truncate text-sm font-medium text-navy">
                        {ev.page_title || ev.page_url}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted">{ev.page_url}</p>
                    {ev.element_selector ? (
                      <p className="mt-0.5 truncate font-mono text-[11px] text-muted">
                        {ev.element_selector}
                      </p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-xs text-muted">{formatDateTime(ev.occurred_at)}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-pill border border-border bg-white px-2.5 py-1 text-[11px] font-semibold text-navy">
      {label}
    </span>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="truncate font-medium text-navy" title={value}>
        {value}
      </dd>
    </div>
  );
}
