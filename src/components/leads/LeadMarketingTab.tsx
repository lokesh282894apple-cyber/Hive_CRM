"use client";

import type { PageEvent, VisitorSession } from "@/types/database";
import { formatDateTime } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/Primitives";
import { MousePointer2, Eye, ArrowDown } from "lucide-react";
import type { FormOriginSummary } from "@/lib/leads/form-origin";

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
  formOrigin?: FormOriginSummary | null;
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
  | {
      kind: "pageview_group";
      page_url: string;
      page_title: string | null;
      count: number;
      at: string;
    }
  | {
      kind: "click_group";
      page_url: string;
      page_title: string | null;
      selector: string | null;
      count: number;
      at: string;
    }
  | { kind: "scroll"; page_url: string; depth: number; at: string };

const MERGE_WINDOW_MS = 45_000;

/** Collapse hash/query noise so /pgp and /pgp#apply group together. */
function canonicalPageUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`.replace(/\/$/, "") || u.origin;
  } catch {
    return url.split("#")[0].split("?")[0];
  }
}

function shortSelector(selector: string | null | undefined): string | null {
  if (!selector) return null;
  // Prefer readable form field ids over long CSS paths
  const idMatch = selector.match(/#([a-zA-Z0-9_-]+)/);
  if (idMatch) return `#${idMatch[1]}`;
  if (selector.length > 80) return `${selector.slice(0, 77)}…`;
  return selector;
}

function scrollDepth(ev: PageEvent): number {
  const fromSelector = String(ev.element_selector || "").match(/(\d+)/);
  if (fromSelector) return Number(fromSelector[1]);
  if (typeof ev.y === "number" && ev.y <= 100) return ev.y;
  return 0;
}

function withinWindow(earlierIso: string, laterIso: string): boolean {
  return (
    new Date(laterIso).getTime() - new Date(earlierIso).getTime() <= MERGE_WINDOW_MS
  );
}

/**
 * Collapse noisy doubles: hash pageviews, repeated field clicks, redundant scrolls.
 * Raw events stay in DB — this is display-only.
 */
function buildTimeline(events: PageEvent[]): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const ev of events) {
    if (ev.event_type === "pageview") {
      const canon = canonicalPageUrl(ev.page_url);
      const last = items[items.length - 1];
      if (
        last?.kind === "pageview_group" &&
        canonicalPageUrl(last.page_url) === canon &&
        withinWindow(last.at, ev.occurred_at)
      ) {
        last.count += 1;
        if (ev.page_title) last.page_title = ev.page_title;
        // Prefer URL with hash if it indicates section (e.g. #apply)
        if (ev.page_url.includes("#")) last.page_url = ev.page_url;
        continue;
      }
      items.push({
        kind: "pageview_group",
        page_url: ev.page_url,
        page_title: ev.page_title,
        count: 1,
        at: ev.occurred_at,
      });
      continue;
    }

    if (ev.event_type === "scroll_depth") {
      const depth = scrollDepth(ev);
      const canon = canonicalPageUrl(ev.page_url);
      const last = items[items.length - 1];
      if (last?.kind === "scroll" && canonicalPageUrl(last.page_url) === canon) {
        last.depth = Math.max(last.depth, depth);
        last.at = ev.occurred_at;
        continue;
      }
      items.push({
        kind: "scroll",
        page_url: ev.page_url,
        depth,
        at: ev.occurred_at,
      });
      continue;
    }

    if (ev.event_type === "click") {
      const selector = shortSelector(ev.element_selector);
      const canon = canonicalPageUrl(ev.page_url);
      const last = items[items.length - 1];
      if (
        last?.kind === "click_group" &&
        canonicalPageUrl(last.page_url) === canon &&
        last.selector === selector &&
        withinWindow(last.at, ev.occurred_at)
      ) {
        last.count += 1;
        continue;
      }
      items.push({
        kind: "click_group",
        page_url: ev.page_url,
        page_title: ev.page_title,
        selector,
        count: 1,
        at: ev.occurred_at,
      });
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
      <div className="space-y-6">
        {data.formOrigin ? (
          <div className="panel p-5">
            <p className="eyebrow">Form origin</p>
            <p className="mt-2 text-lg font-semibold text-navy">{data.formOrigin.label}</p>
            <p className="mt-1 text-sm text-muted">
              Source tag: <span className="font-medium text-navy">{data.formOrigin.source ?? "—"}</span>
            </p>
          </div>
        ) : null}
        <div className="panel p-8">
          <p className="eyebrow">Marketing Box</p>
          <h2 className="mt-2 text-xl font-semibold text-navy">No website journey linked</h2>
          <p className="mt-2 max-w-xl text-sm text-muted">
            This lead has no <code className="text-xs">session_id</code> attribution yet. When the
            admissions form posts through the website proxy with the tracking cookie, first-touch
            campaign and page journey appear here — while you work them through the admissions
            stages on Info / Calling.
          </p>
        </div>
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
      {data.formOrigin ? (
        <div className="panel p-5">
          <p className="eyebrow">Form origin</p>
          <p className="mt-2 text-lg font-semibold text-navy">{data.formOrigin.label}</p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            <Meta label="Source tag" value={data.formOrigin.source ?? "—"} />
            <Meta label="Programme" value={data.formOrigin.programme ?? "—"} />
            <Meta
              label="Form page"
              value={
                data.formOrigin.formPageTitle ||
                data.formOrigin.formPageUrl ||
                "—"
              }
            />
            {data.formOrigin.formPageUrl ? (
              <Meta label="Form URL" value={data.formOrigin.formPageUrl} />
            ) : null}
            {data.formOrigin.thankYouUrl ? (
              <Meta label="Thank-you page" value={data.formOrigin.thankYouUrl} />
            ) : null}
          </dl>
        </div>
      ) : null}

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

              if (item.kind === "scroll") {
                return (
                  <li key={`sc-${idx}`} className="flex items-start gap-3 px-5 py-3">
                    <ArrowDown className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge label="scroll" tone="gray" />
                        <span className="text-sm font-medium text-navy">{item.depth}%</span>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted">{item.page_url}</p>
                    </div>
                    <p className="shrink-0 text-xs text-muted">{formatDateTime(item.at)}</p>
                  </li>
                );
              }

              return (
                <li key={`ck-${idx}`} className="flex items-start gap-3 px-5 py-3">
                  <MousePointer2 className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge label="click" tone="yellow" />
                      {item.count > 1 ? (
                        <span className="text-[11px] text-muted">×{item.count}</span>
                      ) : null}
                      <span className="truncate text-sm font-medium text-navy">
                        {item.page_title || item.page_url}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted">{item.page_url}</p>
                    {item.selector ? (
                      <p className="mt-0.5 truncate font-mono text-[11px] text-muted">
                        {item.selector}
                      </p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-xs text-muted">{formatDateTime(item.at)}</p>
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
