"use client";

import { useEffect, useMemo, useState } from "react";
import type { PageEvent, VisitorSession } from "@/types/database";
import { formatDateTime } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/Primitives";
import {
  MousePointer2,
  Eye,
  ArrowDown,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import type { FormOriginSummary } from "@/lib/leads/form-origin";
import {
  clickMergeKey,
  humanizeClickLabel,
} from "@/lib/marketing/click-label";

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

function dwellLabel(ms: number | null): string {
  if (ms == null || ms < 0) return "—";
  if (ms < 1000) return "<1s";
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  if (mins < 60) return rem ? `${mins}m ${rem}s` : `${mins}m`;
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
      key: string | null;
      label: string;
      count: number;
      at: string;
    }
  | { kind: "scroll"; page_url: string; depth: number; at: string };

type PathClick = {
  /** Merge key (raw selector fingerprint) */
  key: string | null;
  label: string;
  count: number;
  at: string;
};

type PagePathStep = {
  page_url: string;
  page_title: string | null;
  at: string;
  dwellMs: number | null;
  scrollMax: number;
  clicks: PathClick[];
  role: "form" | "thank_you" | "page";
};

type PlaybackBeat =
  | { kind: "page_enter"; stepIndex: number; caption: string }
  | { kind: "click"; stepIndex: number; clickIndex: number; caption: string }
  | { kind: "scroll"; stepIndex: number; caption: string };

const MERGE_WINDOW_MS = 45_000;
const BEAT_MS = 1200;

/** Collapse hash/query noise so /pgp and /pgp#apply group together. */
function canonicalPageUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`.replace(/\/$/, "") || u.origin;
  } catch {
    return url.split("#")[0].split("?")[0];
  }
}

function shortPath(url: string): string {
  try {
    const u = new URL(url);
    const path = `${u.pathname}${u.hash || ""}` || "/";
    return path.length > 64 ? `${path.slice(0, 61)}…` : path;
  } catch {
    return url.length > 64 ? `${url.slice(0, 61)}…` : url;
  }
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

function pageRole(
  pageUrl: string,
  formOrigin?: FormOriginSummary | null
): PagePathStep["role"] {
  if (!formOrigin) return "page";
  const canon = canonicalPageUrl(pageUrl);
  if (formOrigin.thankYouUrl && canonicalPageUrl(formOrigin.thankYouUrl) === canon) {
    return "thank_you";
  }
  if (formOrigin.formPageUrl && canonicalPageUrl(formOrigin.formPageUrl) === canon) {
    return "form";
  }
  if (pageUrl.includes("#apply") || /form-submitted/i.test(pageUrl)) {
    return /form-submitted/i.test(pageUrl) ? "thank_you" : "form";
  }
  return "page";
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
      const key = clickMergeKey(ev.element_selector);
      const label = humanizeClickLabel(ev.element_selector, ev.element_label);
      const canon = canonicalPageUrl(ev.page_url);
      const last = items[items.length - 1];
      if (
        last?.kind === "click_group" &&
        canonicalPageUrl(last.page_url) === canon &&
        last.key === key &&
        withinWindow(last.at, ev.occurred_at)
      ) {
        last.count += 1;
        continue;
      }
      items.push({
        kind: "click_group",
        page_url: ev.page_url,
        page_title: ev.page_title,
        key,
        label,
        count: 1,
        at: ev.occurred_at,
      });
    }
  }

  return items;
}

/** Ordered page story with dwell, scroll, and presses nested under each page. */
function buildPagePath(
  events: PageEvent[],
  endAt?: string | null,
  formOrigin?: FormOriginSummary | null
): PagePathStep[] {
  const sorted = [...events].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
  );
  const steps: PagePathStep[] = [];

  for (const ev of sorted) {
    const canon = canonicalPageUrl(ev.page_url);
    let step = steps[steps.length - 1];
    const onSamePage = step && canonicalPageUrl(step.page_url) === canon;

    if (ev.event_type === "pageview") {
      if (onSamePage && withinWindow(step!.at, ev.occurred_at)) {
        if (ev.page_title) step!.page_title = ev.page_title;
        if (ev.page_url.includes("#")) step!.page_url = ev.page_url;
        continue;
      }
      steps.push({
        page_url: ev.page_url,
        page_title: ev.page_title,
        at: ev.occurred_at,
        dwellMs: null,
        scrollMax: 0,
        clicks: [],
        role: pageRole(ev.page_url, formOrigin),
      });
      continue;
    }

    if (!step) {
      // Click/scroll before any pageview — invent a page step
      steps.push({
        page_url: ev.page_url,
        page_title: ev.page_title,
        at: ev.occurred_at,
        dwellMs: null,
        scrollMax: 0,
        clicks: [],
        role: pageRole(ev.page_url, formOrigin),
      });
      step = steps[steps.length - 1];
    } else if (!onSamePage) {
      steps.push({
        page_url: ev.page_url,
        page_title: ev.page_title,
        at: ev.occurred_at,
        dwellMs: null,
        scrollMax: 0,
        clicks: [],
        role: pageRole(ev.page_url, formOrigin),
      });
      step = steps[steps.length - 1];
    }

    if (ev.event_type === "scroll_depth") {
      step.scrollMax = Math.max(step.scrollMax, scrollDepth(ev));
      continue;
    }

    if (ev.event_type === "click") {
      const key = clickMergeKey(ev.element_selector);
      const label = humanizeClickLabel(ev.element_selector, ev.element_label);
      const lastClick = step.clicks[step.clicks.length - 1];
      if (
        lastClick &&
        lastClick.key === key &&
        withinWindow(lastClick.at, ev.occurred_at)
      ) {
        lastClick.count += 1;
      } else {
        step.clicks.push({ key, label, count: 1, at: ev.occurred_at });
      }
    }
  }

  const journeyEnd = endAt ? new Date(endAt).getTime() : null;
  for (let i = 0; i < steps.length; i++) {
    const start = new Date(steps[i].at).getTime();
    const nextStart =
      i + 1 < steps.length
        ? new Date(steps[i + 1].at).getTime()
        : journeyEnd;
    steps[i].dwellMs = nextStart != null ? Math.max(0, nextStart - start) : null;
    steps[i].role = pageRole(steps[i].page_url, formOrigin);
  }

  return steps;
}

function buildPlaybackScript(path: PagePathStep[]): PlaybackBeat[] {
  const beats: PlaybackBeat[] = [];
  const total = path.length;

  path.forEach((step, stepIndex) => {
    const title = step.page_title || shortPath(step.page_url);
    beats.push({
      kind: "page_enter",
      stepIndex,
      caption: `Page ${stepIndex + 1}/${total} · ${title}`,
    });

    step.clicks.forEach((click, clickIndex) => {
      const times = click.count > 1 ? ` ×${click.count}` : "";
      beats.push({
        kind: "click",
        stepIndex,
        clickIndex,
        caption: `Page ${stepIndex + 1}/${total} · pressed ${click.label}${times}`,
      });
    });

    if (step.scrollMax > 0) {
      beats.push({
        kind: "scroll",
        stepIndex,
        caption: `Page ${stepIndex + 1}/${total} · scrolled ${step.scrollMax}%`,
      });
    }
  });

  return beats;
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
  const path = buildPagePath(
    events,
    attr?.converted_at ?? session?.last_seen_at,
    data.formOrigin
  );

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

      <PageJourneyPanel path={path} timeline={timeline} />
    </div>
  );
}

function PageJourneyPanel({
  path,
  timeline,
}: {
  path: PagePathStep[];
  timeline: TimelineItem[];
}) {
  const script = useMemo(() => buildPlaybackScript(path), [path]);
  const [playing, setPlaying] = useState(false);
  const [beatIndex, setBeatIndex] = useState(0);

  useEffect(() => {
    if (!playing || script.length === 0) return;
    if (beatIndex >= script.length - 1) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => {
      setBeatIndex((i) => Math.min(i + 1, script.length - 1));
    }, BEAT_MS);
    return () => window.clearTimeout(id);
  }, [playing, beatIndex, script.length]);

  const activeBeat = script[beatIndex] ?? null;
  const activeStepIndex = activeBeat?.stepIndex ?? null;
  const activeClickIndex =
    activeBeat?.kind === "click" ? activeBeat.clickIndex : null;

  function togglePlay() {
    if (script.length === 0) return;
    if (playing) {
      setPlaying(false);
      return;
    }
    if (beatIndex >= script.length - 1) {
      setBeatIndex(0);
    }
    setPlaying(true);
  }

  function reset() {
    setPlaying(false);
    setBeatIndex(0);
  }

  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Page journey</p>
            <p className="mt-1 text-xs text-muted">
              Watch the visit step by step — pages and what they pressed.
            </p>
          </div>
          {path.length > 0 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={togglePlay}
                className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-white px-3 py-1.5 text-xs font-semibold text-navy hover:bg-[#F7F8FC]"
              >
                {playing ? (
                  <>
                    <Pause className="h-3.5 w-3.5" /> Pause
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" /> Play
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-white px-3 py-1.5 text-xs font-semibold text-muted hover:bg-[#F7F8FC] hover:text-navy"
                title="Restart"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
        </div>

        {path.length > 0 && script.length > 0 ? (
          <div className="mt-4 space-y-2">
            <input
              type="range"
              min={0}
              max={Math.max(0, script.length - 1)}
              value={beatIndex}
              onChange={(e) => {
                setPlaying(false);
                setBeatIndex(Number(e.target.value));
              }}
              className="w-full accent-[var(--periwinkle,#6B7CFF)]"
              aria-label="Journey scrubber"
            />
            <p className="text-sm font-medium text-navy">
              {activeBeat?.caption ?? "Ready"}
            </p>
          </div>
        ) : null}
      </div>

      {path.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">No page events recorded for this session.</p>
      ) : (
        <ol className="divide-y divide-border">
          {path.map((step, stepIndex) => {
            const isActive = activeStepIndex === stepIndex;
            return (
              <li
                key={`step-${stepIndex}-${step.at}`}
                className={`px-5 py-4 transition-colors ${
                  isActive ? "bg-[#F0F3FF]" : "bg-white"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      isActive
                        ? "bg-periwinkle text-white"
                        : "border border-border bg-white text-navy"
                    }`}
                  >
                    {stepIndex + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-navy">
                        {step.page_title || shortPath(step.page_url)}
                      </span>
                      {step.role === "form" ? (
                        <StatusBadge label="form" tone="blue" />
                      ) : null}
                      {step.role === "thank_you" ? (
                        <StatusBadge label="thank-you" tone="green" />
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted" title={step.page_url}>
                      {shortPath(step.page_url)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Chip label={`${dwellLabel(step.dwellMs)} on page`} />
                      <Chip label={`Scroll ${step.scrollMax}%`} />
                      <Chip
                        label={`${step.clicks.length} press${step.clicks.length === 1 ? "" : "es"}`}
                      />
                      <span className="text-[11px] text-muted">
                        {formatDateTime(step.at)}
                      </span>
                    </div>

                    <div className="mt-3 pl-1">
                      {step.clicks.length === 0 ? (
                        <p className="text-xs text-muted">No clicks recorded on this page.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {step.clicks.map((click, clickIndex) => {
                            const clickActive =
                              isActive && activeClickIndex === clickIndex;
                            return (
                              <li
                                key={`click-${stepIndex}-${clickIndex}-${click.at}`}
                                className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs ${
                                  clickActive
                                    ? "bg-white ring-1 ring-periwinkle/40"
                                    : "bg-transparent"
                                }`}
                              >
                                <MousePointer2
                                  className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                                    clickActive ? "text-periwinkle" : "text-gold"
                                  }`}
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-navy">
                                    Pressed {click.label}
                                    {click.count > 1 ? (
                                      <span className="ml-1 text-muted">×{click.count}</span>
                                    ) : null}
                                  </p>
                                  <p className="text-[11px] text-muted">
                                    {formatDateTime(click.at)}
                                  </p>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {timeline.length > 0 ? (
        <details className="border-t border-border">
          <summary className="cursor-pointer px-5 py-3 text-xs font-semibold uppercase tracking-eyebrow text-muted hover:text-navy">
            All events ({timeline.length})
          </summary>
          <ul className="divide-y divide-border border-t border-border">
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
                        {item.label}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted">{item.page_url}</p>
                  </div>
                  <p className="shrink-0 text-xs text-muted">{formatDateTime(item.at)}</p>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
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
