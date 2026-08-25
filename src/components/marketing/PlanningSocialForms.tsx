"use client";

import {
  createActivation,
  createCalendarItem,
  createMarketingTask,
  createMentorTracker,
  createSocialPost,
  syncForecastActuals,
  updateCalendarItemStatus,
  updateMarketingTaskStatus,
  upsertMarketingForecast,
} from "@/app/actions/marketing-dashboard";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

const CHANNELS = [
  "Meta",
  "LinkedIn (organic)",
  "Instagram",
  "YouTube",
  "WhatsApp",
  "Google",
  "Organic other",
] as const;

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label-field">{label}</label>
      {children}
    </div>
  );
}

function Msg({ error, ok }: { error: string | null; ok: string | null }) {
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (ok) return <p className="text-sm text-emerald-700">{ok}</p>;
  return null;
}

export function ForecastEntryPanel({ monthKey }: { monthKey: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await upsertMarketingForecast({
        month_key: monthKey,
        channel: String(fd.get("channel")),
        programme: String(fd.get("programme") || "") || null,
        owner: String(fd.get("owner") || "") || null,
        leads_forecast: Number(fd.get("leads_forecast") || 0),
        spend_forecast_inr: Number(fd.get("spend_forecast_inr") || 0),
      });
      if (!res.ok) setError(res.error);
      else {
        setError(null);
        setOk("Forecast row saved.");
        (e.target as HTMLFormElement).reset();
        router.refresh();
      }
    });
  }

  function onSyncActuals() {
    start(async () => {
      const res = await syncForecastActuals(monthKey);
      if (!res.ok) setError(res.error);
      else {
        setError(null);
        setOk(res.message ?? "Actuals updated from CRM.");
        router.refresh();
      }
    });
  }

  function onActivation(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await createActivation({
        month_key: monthKey,
        activity: String(fd.get("activity")),
        activity_type: String(fd.get("activity_type") || "other"),
        owner: String(fd.get("owner") || "") || null,
        planned_date: String(fd.get("planned_date") || "") || null,
        planned_qty: Number(fd.get("planned_qty") || 0),
        delivered_qty: Number(fd.get("delivered_qty") || 0),
        output_metric: String(fd.get("output_metric") || "") || null,
        output_value: Number(fd.get("output_value") || 0) || null,
        status: String(fd.get("status") || "planned"),
      });
      if (!res.ok) setError(res.error);
      else {
        setError(null);
        setOk("Activation saved.");
        (e.target as HTMLFormElement).reset();
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <Msg error={error} ok={ok} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary"
          disabled={pending}
          onClick={onSyncActuals}
        >
          {pending ? "Updating…" : "Refresh actuals from CRM"}
        </button>
        <p className="self-center text-xs text-muted">
          Auto-fills Leads A / Spend A from leads + Meta spend
        </p>
      </div>

      <form onSubmit={onSubmit} className="panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <p className="eyebrow sm:col-span-2 lg:col-span-3">Add forecast row</p>
        <Field label="Channel">
          <select name="channel" className="input-field" required defaultValue="Meta">
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Programme">
          <input name="programme" className="input-field" placeholder="PGP Offline" />
        </Field>
        <Field label="Owner">
          <input name="owner" className="input-field" placeholder="Prabhu" />
        </Field>
        <Field label="Leads forecast">
          <input name="leads_forecast" type="number" min={0} className="input-field" defaultValue={0} />
        </Field>
        <Field label="Spend forecast (INR)">
          <input name="spend_forecast_inr" type="number" min={0} className="input-field" defaultValue={0} />
        </Field>
        <div className="flex items-end">
          <button type="submit" className="btn-primary" disabled={pending}>
            Save forecast
          </button>
        </div>
      </form>

      <form onSubmit={onActivation} className="panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <p className="eyebrow sm:col-span-2 lg:col-span-3">Add Non-Meta activation</p>
        <Field label="Activity">
          <input name="activity" className="input-field" required placeholder="Webinar / LinkedIn live" />
        </Field>
        <Field label="Type">
          <input name="activity_type" className="input-field" placeholder="webinar" />
        </Field>
        <Field label="Owner">
          <input name="owner" className="input-field" />
        </Field>
        <Field label="Planned date">
          <input name="planned_date" type="date" className="input-field" />
        </Field>
        <Field label="Planned qty">
          <input name="planned_qty" type="number" min={0} className="input-field" defaultValue={1} />
        </Field>
        <Field label="Delivered qty">
          <input name="delivered_qty" type="number" min={0} className="input-field" defaultValue={0} />
        </Field>
        <Field label="Output metric">
          <input name="output_metric" className="input-field" placeholder="leads" />
        </Field>
        <Field label="Output value">
          <input name="output_value" type="number" className="input-field" />
        </Field>
        <Field label="Status">
          <select name="status" className="input-field" defaultValue="planned">
            <option value="planned">planned</option>
            <option value="done">done</option>
            <option value="missed">missed</option>
          </select>
        </Field>
        <div className="flex items-end">
          <button type="submit" className="btn-primary" disabled={pending}>
            Save activation
          </button>
        </div>
      </form>
    </div>
  );
}

export function CalendarEntryPanel() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await createCalendarItem({
        planned_date: String(fd.get("planned_date")),
        channel: String(fd.get("channel")),
        activity_title: String(fd.get("activity_title")),
        content_pillar: String(fd.get("content_pillar") || "") || null,
        post_type: String(fd.get("post_type") || "") || null,
        owner: String(fd.get("owner") || "") || null,
      });
      if (!res.ok) setError(res.error);
      else {
        setError(null);
        setOk("Calendar item added.");
        (e.target as HTMLFormElement).reset();
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
      <p className="eyebrow sm:col-span-2 lg:col-span-3">Add calendar item</p>
      <Msg error={error} ok={ok} />
      <Field label="Date">
        <input name="planned_date" type="date" className="input-field" required />
      </Field>
      <Field label="Channel">
        <select name="channel" className="input-field" required defaultValue="Instagram">
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Activity / topic">
        <input name="activity_title" className="input-field" required />
      </Field>
      <Field label="Pillar">
        <input name="content_pillar" className="input-field" />
      </Field>
      <Field label="Post type">
        <input name="post_type" className="input-field" placeholder="Reel / Carousel" />
      </Field>
      <Field label="Owner">
        <input name="owner" className="input-field" />
      </Field>
      <div className="flex items-end">
        <button type="submit" className="btn-primary" disabled={pending}>
          Add to calendar
        </button>
      </div>
    </form>
  );
}

export function CalendarStatusButtons({
  id,
  current,
}: {
  id: string;
  current: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function setStatus(status: string) {
    start(async () => {
      await updateCalendarItemStatus(id, status);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-1">
      {(["published", "missed", "rescheduled"] as const).map((s) => (
        <button
          key={s}
          type="button"
          disabled={pending}
          onClick={() => setStatus(s)}
          className={`rounded-lg px-2 py-0.5 text-[11px] capitalize ${
            current === s ? "bg-navy text-white" : "border border-border text-muted hover:text-navy"
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

export function SocialEntryPanel({
  platform,
}: {
  platform: "instagram" | "youtube" | "linkedin" | "whatsapp";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await createSocialPost({
        platform,
        post_date: String(fd.get("post_date")),
        title: String(fd.get("title")),
        status: String(fd.get("status") || "published"),
        post_type: String(fd.get("post_type") || "") || null,
        content_pillar: String(fd.get("content_pillar") || "") || null,
        link: String(fd.get("link") || "") || null,
        reach: Number(fd.get("reach") || 0) || null,
        views: Number(fd.get("views") || 0) || null,
        impressions: Number(fd.get("impressions") || 0) || null,
        likes: Number(fd.get("likes") || 0) || null,
        comments: Number(fd.get("comments") || 0) || null,
        leads_generated: Number(fd.get("leads_generated") || 0) || null,
        delivered: Number(fd.get("delivered") || 0) || null,
        opened: Number(fd.get("opened") || 0) || null,
        clicked: Number(fd.get("clicked") || 0) || null,
      });
      if (!res.ok) setError(res.error);
      else {
        setError(null);
        setOk("Post logged (also added to calendar).");
        (e.target as HTMLFormElement).reset();
        router.refresh();
      }
    });
  }

  function onMentor(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await createMentorTracker({
        name: String(fd.get("name")),
        campaign_context: String(fd.get("campaign_context") || "") || null,
        linkedin_url: String(fd.get("linkedin_url") || "") || null,
        posting_status: String(fd.get("posting_status") || "not_started"),
      });
      if (!res.ok) setError(res.error);
      else {
        setError(null);
        setOk("Mentor tracker row added.");
        (e.target as HTMLFormElement).reset();
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <Msg error={error} ok={ok} />
      <form onSubmit={onSubmit} className="panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <p className="eyebrow sm:col-span-2 lg:col-span-3 capitalize">
          Log {platform} post
        </p>
        <Field label="Date">
          <input name="post_date" type="date" className="input-field" required />
        </Field>
        <Field label="Title / topic">
          <input name="title" className="input-field" required />
        </Field>
        <Field label="Status">
          <select name="status" className="input-field" defaultValue="published">
            <option value="published">published</option>
            <option value="planned">planned</option>
            <option value="missed">missed</option>
          </select>
        </Field>
        <Field label="Type">
          <input name="post_type" className="input-field" placeholder="Reel / Short / Broadcast" />
        </Field>
        <Field label="Pillar">
          <input name="content_pillar" className="input-field" />
        </Field>
        <Field label="Link">
          <input name="link" className="input-field" placeholder="https://" />
        </Field>
        <Field label="Reach">
          <input name="reach" type="number" min={0} className="input-field" />
        </Field>
        <Field label="Views">
          <input name="views" type="number" min={0} className="input-field" />
        </Field>
        <Field label="Impressions">
          <input name="impressions" type="number" min={0} className="input-field" />
        </Field>
        <Field label="Likes">
          <input name="likes" type="number" min={0} className="input-field" />
        </Field>
        <Field label="Comments">
          <input name="comments" type="number" min={0} className="input-field" />
        </Field>
        <Field label="Leads">
          <input name="leads_generated" type="number" min={0} className="input-field" />
        </Field>
        {platform === "whatsapp" ? (
          <>
            <Field label="Delivered">
              <input name="delivered" type="number" min={0} className="input-field" />
            </Field>
            <Field label="Opened">
              <input name="opened" type="number" min={0} className="input-field" />
            </Field>
            <Field label="Clicked">
              <input name="clicked" type="number" min={0} className="input-field" />
            </Field>
          </>
        ) : null}
        <div className="flex items-end">
          <button type="submit" className="btn-primary" disabled={pending}>
            Save post
          </button>
        </div>
      </form>

      {platform === "linkedin" ? (
        <form onSubmit={onMentor} className="panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <p className="eyebrow sm:col-span-2 lg:col-span-3">Add mentor / partner</p>
          <Field label="Name">
            <input name="name" className="input-field" required />
          </Field>
          <Field label="Campaign context">
            <input name="campaign_context" className="input-field" />
          </Field>
          <Field label="LinkedIn URL">
            <input name="linkedin_url" className="input-field" />
          </Field>
          <Field label="Status">
            <select name="posting_status" className="input-field" defaultValue="not_started">
              <option value="not_started">not started</option>
              <option value="requested">requested</option>
              <option value="posted">posted</option>
              <option value="declined">declined</option>
            </select>
          </Field>
          <div className="flex items-end">
            <button type="submit" className="btn-primary" disabled={pending}>
              Save mentor
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

export function TaskEntryPanel() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await createMarketingTask({
        title: String(fd.get("title")),
        channel: String(fd.get("channel") || "") || null,
        owner: String(fd.get("owner") || "") || null,
        due_date: String(fd.get("due_date") || "") || null,
      });
      if (!res.ok) setError(res.error);
      else {
        setError(null);
        setOk("Task added.");
        (e.target as HTMLFormElement).reset();
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <p className="eyebrow sm:col-span-2 lg:col-span-4">Add task</p>
      <Msg error={error} ok={ok} />
      <Field label="Task">
        <input name="title" className="input-field" required />
      </Field>
      <Field label="Channel">
        <input name="channel" className="input-field" />
      </Field>
      <Field label="Owner">
        <input name="owner" className="input-field" />
      </Field>
      <Field label="Due date">
        <input name="due_date" type="date" className="input-field" />
      </Field>
      <div className="flex items-end">
        <button type="submit" className="btn-primary" disabled={pending}>
          Add task
        </button>
      </div>
    </form>
  );
}

export function TaskStatusSelect({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <select
      className="input-field py-1 text-xs"
      disabled={pending}
      defaultValue={status}
      onChange={(e) => {
        start(async () => {
          await updateMarketingTaskStatus(id, e.target.value);
          router.refresh();
        });
      }}
    >
      <option value="todo">todo</option>
      <option value="in_progress">in progress</option>
      <option value="done">done</option>
      <option value="blocked">blocked</option>
    </select>
  );
}
