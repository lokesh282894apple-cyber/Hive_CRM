"use client";

import { createCampaign, createCreative } from "@/app/actions/marketing";
import {
  CAMPAIGN_SOURCE_TYPES,
  CREATIVE_TYPES,
  type CampaignSourceType,
  type CreativeType,
} from "@/lib/constants";
import { StatusBadge } from "@/components/ui/Primitives";
import type { AdCreative, Campaign, MarketingChannel } from "@/types/database";
import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function CampaignsClient({
  channels,
  campaigns,
  creatives,
  appOrigin,
  metrics = {},
}: {
  channels: MarketingChannel[];
  campaigns: Campaign[];
  creatives: AdCreative[];
  appOrigin: string;
  metrics?: Record<string, { sessions: number; attributed: number }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<CampaignSourceType>("paid_ad");
  const [creativeType, setCreativeType] = useState<CreativeType>("ad");
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");

  const creativesByCampaign = useMemo(() => {
    const map = new Map<string, AdCreative[]>();
    for (const c of creatives) {
      const list = map.get(c.campaign_id) ?? [];
      list.push(c);
      map.set(c.campaign_id, list);
    }
    return map;
  }, [creatives]);

  function copyLink(url: string) {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(url);
      setTimeout(() => setCopied(null), 1500);
    });
  }
  function onCampaign(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createCampaign({
        channel_id: String(fd.get("channel_id")),
        name: String(fd.get("name")),
        source_type: sourceType,
        start_date: String(fd.get("start_date") || "") || null,
        end_date: String(fd.get("end_date") || "") || null,
        ad_account_id: String(fd.get("ad_account_id") || "") || null,
      });
      if (!res.ok) setError(res.error);
      else {
        setError(null);
        (e.target as HTMLFormElement).reset();
        router.refresh();
      }
    });
  }

  function onCreative(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createCreative({
        campaign_id: String(fd.get("campaign_id")),
        creative_name: String(fd.get("creative_name")),
        creative_type: creativeType,
        destination_url: String(fd.get("destination_url")),
        influencer_name: String(fd.get("influencer_name") || "") || null,
        influencer_handle: String(fd.get("influencer_handle") || "") || null,
        post_url: String(fd.get("post_url") || "") || null,
        tracked_slug: String(fd.get("tracked_slug") || "") || null,
      });
      if (!res.ok) setError(res.error);
      else {
        setError(null);
        (e.target as HTMLFormElement).reset();
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-8">
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={onCampaign} className="panel space-y-3 p-5">
          <p className="eyebrow">New campaign</p>
          <div>
            <label className="label-field">Channel</label>
            <select name="channel_id" className="input-field" required>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-field">Name</label>
            <input name="name" className="input-field" required />
          </div>
          <div>
            <label className="label-field">Source type</label>
            <select
              className="input-field"
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as CampaignSourceType)}
            >
              {CAMPAIGN_SOURCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-field">Start</label>
              <input name="start_date" type="date" className="input-field" />
            </div>
            <div>
              <label className="label-field">End</label>
              <input name="end_date" type="date" className="input-field" />
            </div>
          </div>
          <div>
            <label className="label-field">Ad account id (optional)</label>
            <input name="ad_account_id" className="input-field" />
          </div>
          <button type="submit" className="btn-primary" disabled={pending}>
            Create campaign
          </button>
        </form>

        <form onSubmit={onCreative} className="panel space-y-3 p-5">
          <p className="eyebrow">New creative · tracked slug</p>
          <div>
            <label className="label-field">Campaign</label>
            <select
              name="campaign_id"
              className="input-field"
              required
              value={campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-field">Creative name</label>
            <input name="creative_name" className="input-field" required />
          </div>
          <div>
            <label className="label-field">Type</label>
            <select
              className="input-field"
              value={creativeType}
              onChange={(e) => setCreativeType(e.target.value as CreativeType)}
            >
              {CREATIVE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-field">Destination URL</label>
            <input
              name="destination_url"
              className="input-field"
              required
              placeholder="https://hiveschool.co/admissions"
            />
          </div>
          <div>
            <label className="label-field">Tracked slug (optional)</label>
            <input
              name="tracked_slug"
              className="input-field"
              placeholder="auto-generated if blank"
            />
            <p className="mt-1 text-xs text-muted">
              Links become {appOrigin}/go/&#123;slug&#125;
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-field">Influencer</label>
              <input name="influencer_name" className="input-field" />
            </div>
            <div>
              <label className="label-field">Handle</label>
              <input name="influencer_handle" className="input-field" />
            </div>
          </div>
          <div>
            <label className="label-field">Post URL</label>
            <input name="post_url" className="input-field" />
          </div>
          <button type="submit" className="btn-primary" disabled={pending || !campaigns.length}>
            Create creative
          </button>
        </form>
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <p className="eyebrow">Campaigns & creatives</p>
        </div>
        <ul className="divide-y divide-border">
          {campaigns.map((campaign) => {
            const channel = channels.find((c) => c.id === campaign.channel_id);
            const list = creativesByCampaign.get(campaign.id) ?? [];
            const m = metrics[campaign.id];
            return (
              <li key={campaign.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-navy">{campaign.name}</p>
                  <StatusBadge label={campaign.source_type} tone="blue" />
                  <StatusBadge label={campaign.status} tone="gray" />
                  <span className="text-xs text-muted">{channel?.name}</span>
                  {m ? (
                    <span className="text-xs font-semibold text-periwinkle">
                      {m.sessions} sess · {m.attributed} forms
                    </span>
                  ) : null}
                </div>
                {list.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">
                    No tracked creatives — add one above for influencer /go links.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {list.map((cr) => {
                      const url = `${appOrigin}/go/${cr.tracked_slug}`;
                      return (
                        <li
                          key={cr.id}
                          className="flex flex-col gap-2 rounded-xl border border-border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <p className="text-sm font-medium text-navy">{cr.creative_name}</p>
                            <p className="text-xs text-muted">
                              {cr.creative_type}
                              {cr.influencer_name ? ` · ${cr.influencer_name}` : ""}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <code className="max-w-[240px] truncate text-xs text-periwinkle">
                              {url}
                            </code>
                            <button
                              type="button"
                              className="rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-navy"
                              onClick={() => copyLink(url)}
                            >
                              {copied === url ? "Copied" : "Copy"}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
          {campaigns.length === 0 ? (
            <li className="px-5 py-8 text-sm text-muted">No campaigns yet.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
