"use client";

import {
  updateAppSetting,
  upsertCohort,
  upsertCourse,
  upsertLoanVendor,
} from "@/app/actions/settings";
import type { Cohort, Course, LoanVendor } from "@/types/database";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";

type Tab = "courses" | "vendors" | "fees";

export function SettingsClient({
  courses,
  cohorts,
  vendors,
  daysBetween,
  defaultInstallmentCount,
  manualMonthlyAdSpend = 0,
  googleMeetConfigured = false,
}: {
  courses: Course[];
  cohorts: Cohort[];
  vendors: LoanVendor[];
  daysBetween: number;
  defaultInstallmentCount: number;
  manualMonthlyAdSpend?: number;
  googleMeetConfigured?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (searchParams.get("tab") as Tab) || "courses";
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function setTab(next: Tab) {
    router.push(next === "courses" ? "/admin/config" : `/admin/config?tab=${next}`);
  }

  function wrap(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const res = await action();
      setMsg(res.ok ? "Saved" : res.error ?? "Error");
      router.refresh();
    });
  }

  return (
    <div>
      <div
        className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
          googleMeetConfigured
            ? "border-periwinkle/30 bg-periwinkle/5 text-navy"
            : "border-warning/40 bg-yellow-50 text-navy"
        }`}
      >
        <p className="font-semibold">
          Google Meet · {googleMeetConfigured ? "Connected" : "Not connected"}
        </p>
        <p className="mt-1 text-muted">
          {googleMeetConfigured
            ? "Interview bookings create Calendar events with Meet links on the shared admissions calendar."
            : "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in .env.local. Run npm run google:oauth once to obtain a refresh token. See README."}
        </p>
      </div>

      <div className="mb-6 flex gap-1 rounded-pill border border-border bg-white p-1 w-fit">
        {(
          [
            ["courses", "Courses & Cohorts"],
            ["vendors", "Loan Vendors"],
            ["fees", "Fee Templates"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-pill px-4 py-1.5 text-xs font-semibold uppercase tracking-eyebrow ${
              tab === id ? "bg-navy text-white" : "text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {msg ? <p className="mb-3 text-sm text-periwinkle">{msg}</p> : null}

      {tab === "courses" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <form
            className="panel space-y-3 p-5"
            onSubmit={(e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              fd.set("active", "true");
              wrap(() => upsertCourse(fd));
            }}
          >
            <p className="eyebrow">Add course</p>
            <input name="name" className="input-field" placeholder="Course name" required />
            <button type="submit" className="btn-primary" disabled={pending}>
              Create course
            </button>
            <ul className="mt-4 space-y-2 border-t border-border pt-4">
              {courses.map((c) => (
                <li key={c.id} className="flex items-center justify-between text-sm">
                  <span>{c.name}</span>
                  <StatusToggle
                    active={c.active}
                    onToggle={() => {
                      const fd = new FormData();
                      fd.set("id", c.id);
                      fd.set("name", c.name);
                      fd.set("active", c.active ? "false" : "true");
                      wrap(() => upsertCourse(fd));
                    }}
                  />
                </li>
              ))}
            </ul>
          </form>

          <form
            className="panel space-y-3 p-5"
            onSubmit={(e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              fd.set("active", "true");
              wrap(() => upsertCohort(fd));
            }}
          >
            <p className="eyebrow">Add cohort</p>
            <select name="course_id" className="input-field" required>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input name="name" className="input-field" placeholder="Cohort name" required />
            <input name="start_date" type="date" className="input-field" />
            <input
              name="default_total_fee"
              type="number"
              className="input-field"
              placeholder="Default total fee"
              defaultValue={350000}
            />
            <button type="submit" className="btn-primary" disabled={pending}>
              Create cohort
            </button>
            <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto border-t border-border pt-4">
              {cohorts.map((c) => (
                <li key={c.id} className="text-sm">
                  <span className="font-medium text-navy">{c.name}</span>
                  <span className="text-muted">
                    {" "}
                    · ₹{Number(c.default_total_fee).toLocaleString("en-IN")}
                  </span>
                </li>
              ))}
            </ul>
          </form>
        </div>
      ) : null}

      {tab === "vendors" ? (
        <div className="panel max-w-lg space-y-3 p-5">
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              fd.set("active", "true");
              wrap(() => upsertLoanVendor(fd));
            }}
          >
            <p className="eyebrow">Loan vendors</p>
            <input name="name" className="input-field" placeholder="Vendor name" required />
            <button type="submit" className="btn-primary" disabled={pending}>
              Add vendor
            </button>
          </form>
          <ul className="space-y-2 border-t border-border pt-4">
            {vendors.map((v) => (
              <li key={v.id} className="flex items-center justify-between text-sm">
                <span>{v.name}</span>
                <StatusToggle
                  active={v.active}
                  onToggle={() => {
                    const fd = new FormData();
                    fd.set("id", v.id);
                    fd.set("name", v.name);
                    fd.set("active", v.active ? "false" : "true");
                    wrap(() => upsertLoanVendor(fd));
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {tab === "fees" ? (
        <form
          className="panel max-w-lg space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            wrap(async () => {
              await updateAppSetting(
                "days_between_installments",
                Number(fd.get("days_between_installments"))
              );
              await updateAppSetting(
                "default_installment_count",
                Number(fd.get("default_installment_count"))
              );
              const spend = Number(fd.get("manual_monthly_ad_spend") || 0);
              await updateAppSetting(
                "manual_monthly_ad_spend",
                spend > 0 ? { amount: Math.round(spend) } : { amount: 0 }
              );
              return { ok: true };
            });
          }}
        >
          <p className="eyebrow">Fee templates</p>
          <p className="text-sm text-muted">
            Installment cadence is admin-configurable (exact interval still provisional — default 30
            days).
          </p>
          <div>
            <label className="label-field">Days between installments</label>
            <input
              name="days_between_installments"
              type="number"
              className="input-field"
              defaultValue={daysBetween}
              min={1}
            />
          </div>
          <div>
            <label className="label-field">Default installment count</label>
            <input
              name="default_installment_count"
              type="number"
              className="input-field"
              defaultValue={defaultInstallmentCount}
              min={1}
            />
          </div>
          <div>
            <label className="label-field">Manual monthly ad spend (₹)</label>
            <input
              name="manual_monthly_ad_spend"
              type="number"
              className="input-field"
              defaultValue={manualMonthlyAdSpend || ""}
              min={0}
              placeholder="For rough CPE until ad platforms connect"
            />
            <p className="mt-1 text-xs text-muted">
              Used on the founder dashboard for cost-per-enrolled when live spend is empty.
            </p>
          </div>
          <button type="submit" className="btn-primary" disabled={pending}>
            Save fee settings
          </button>
        </form>
      ) : null}
    </div>
  );
}

function StatusToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="btn-ghost text-xs" onClick={onToggle}>
      {active ? "Active" : "Inactive"}
    </button>
  );
}
