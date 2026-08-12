import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatusBadge } from "@/components/ui/Primitives";
import { fetchSessionDetail } from "@/lib/marketing/queries";
import { humanizeClickLabel } from "@/lib/marketing/click-label";
import { formatDateTime } from "@/lib/utils";
import { notFound } from "next/navigation";
import Link from "next/link";

export default async function MarketingSessionDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireUser(["admin", "marketing"]);
  const supabase = createClient();
  const detail = await fetchSessionDetail(supabase, params.id);
  if (!detail) notFound();

  const { session, events, attribution, campaign, channelName, creative, leadName } = detail;

  return (
    <div>
      <PageHeader
        eyebrow="Marketing · Session"
        title="Journey"
        accent="detail"
        description={session.id}
        actions={
          <Link href="/marketing/sessions" className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-navy">
            ← All sessions
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="panel p-5">
          <p className="eyebrow">Attribution</p>
          <p className="mt-2 text-lg font-semibold text-navy">
            {campaign?.name ?? "Unattributed"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {channelName ? `${channelName} · ` : ""}
            {campaign?.source_type ?? "—"}
          </p>
          {creative ? (
            <p className="mt-2 text-sm text-periwinkle">
              /go/{creative.tracked_slug} · {creative.creative_name}
            </p>
          ) : null}
        </div>
        <div className="panel p-5">
          <p className="eyebrow">Device</p>
          <p className="mt-2 text-lg font-semibold capitalize text-navy">
            {[session.device_type, session.os, session.browser].filter(Boolean).join(" · ") ||
              "—"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {formatDateTime(session.first_seen_at)} → {formatDateTime(session.last_seen_at)}
          </p>
        </div>
        <div className="panel p-5">
          <p className="eyebrow">Admissions handoff</p>
          {attribution?.lead_id ? (
            <>
              <p className="mt-2 text-lg font-semibold text-navy">{leadName}</p>
              <Link
                href={`/leads/${attribution.lead_id}?tab=marketing`}
                className="mt-2 inline-block text-sm font-semibold text-periwinkle hover:underline"
              >
                Open Marketing Box →
              </Link>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">Not converted (no form yet).</p>
          )}
        </div>
      </div>

      <div className="panel mt-6 p-5">
        <p className="eyebrow">UTM & entry</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <Meta label="Entry" value={session.entry_page_url ?? "—"} />
          <Meta label="Referrer" value={session.referrer_url ?? "—"} />
          <Meta
            label="UTM"
            value={
              [session.utm_source, session.utm_medium, session.utm_campaign]
                .filter(Boolean)
                .join(" / ") || "—"
            }
          />
          <Meta label="Content / term" value={[session.utm_content, session.utm_term].filter(Boolean).join(" / ") || "—"} />
          <Meta label="Click id" value={session.click_id ?? "—"} />
          <Meta label="Events" value={String(events.length)} />
        </dl>
      </div>

      <section className="panel mt-6 overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <p className="eyebrow">Event timeline ({events.length})</p>
        </div>
        <ul className="divide-y divide-border max-h-[560px] overflow-y-auto">
          {events.map((ev) => (
            <li key={ev.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
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
                {ev.event_type === "click" ? (
                  <p className="mt-0.5 truncate text-xs font-medium text-navy">
                    {humanizeClickLabel(ev.element_selector, ev.element_label)}
                  </p>
                ) : ev.element_selector ? (
                  <p className="mt-0.5 truncate font-mono text-[11px] text-muted">
                    {ev.element_selector}
                  </p>
                ) : null}
              </div>
              <p className="shrink-0 text-xs text-muted">{formatDateTime(ev.occurred_at)}</p>
            </li>
          ))}
          {events.length === 0 ? (
            <li className="px-5 py-8 text-sm text-muted">No events for this session.</li>
          ) : null}
        </ul>
      </section>
    </div>
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
