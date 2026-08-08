"use client";

import type { PageEvent, VisitorSession } from "@/types/database";
import { formatDateTime } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/Primitives";

export type LeadMarketingData = {
  attribution: {
    first_touch_at: string | null;
    converted_at: string;
    first_touch_campaign: string | null;
    last_touch_campaign: string | null;
  } | null;
  session: VisitorSession | null;
  creativeName: string | null;
  events: PageEvent[];
};

export function LeadMarketingTab({ data }: { data: LeadMarketingData }) {
  if (!data.attribution && !data.session) {
    return (
      <div className="panel p-8">
        <p className="eyebrow">Attribution</p>
        <h2 className="mt-2 text-xl font-semibold text-navy">No marketing data</h2>
        <p className="mt-2 max-w-xl text-sm text-muted">
          This lead has no linked visitor session yet. Website form submissions that include{" "}
          <code className="text-xs">session_id</code> will populate first-touch campaign and page
          journey here.
        </p>
      </div>
    );
  }

  const session = data.session;
  const attr = data.attribution;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="panel p-5">
          <p className="eyebrow">First touch</p>
          <p className="mt-2 text-lg font-semibold text-navy">
            {attr?.first_touch_campaign ?? "Unattributed"}
          </p>
          <p className="mt-1 text-xs text-muted">
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
            <StatusBadge label="Tracked slug" tone="blue" />
          ) : (
            <StatusBadge label="UTM / referrer" tone="gray" />
          )}
        </div>
      </div>

      {session ? (
        <div className="panel p-5">
          <p className="eyebrow">Session</p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            <div>
              <dt className="text-xs text-muted">Device</dt>
              <dd className="font-medium text-navy">
                {[session.device_type, session.os, session.browser].filter(Boolean).join(" · ") ||
                  "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Entry page</dt>
              <dd className="truncate font-medium text-navy" title={session.entry_page_url ?? ""}>
                {session.entry_page_url ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Referrer</dt>
              <dd className="truncate font-medium text-navy" title={session.referrer_url ?? ""}>
                {session.referrer_url ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">UTM source / medium</dt>
              <dd className="font-medium text-navy">
                {[session.utm_source, session.utm_medium].filter(Boolean).join(" / ") || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">UTM campaign</dt>
              <dd className="font-medium text-navy">{session.utm_campaign ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Click id</dt>
              <dd className="truncate font-medium text-navy">{session.click_id ?? "—"}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      <div className="panel overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <p className="eyebrow">Page journey</p>
        </div>
        {data.events.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">No page events recorded for this session.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.events.map((ev) => (
              <li key={ev.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      label={ev.event_type}
                      tone={
                        ev.event_type === "pageview"
                          ? "blue"
                          : ev.event_type === "click"
                            ? "yellow"
                            : "gray"
                      }
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
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
