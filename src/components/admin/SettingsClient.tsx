"use client";

import {
  deleteCohort,
  updateAppSetting,
  upsertCohort,
  upsertCourse,
  upsertLoanVendor,
} from "@/app/actions/settings";
import { CounselorsConfigPanel } from "@/components/admin/CounselorsConfigPanel";
import { TriggerRulesPanel } from "@/components/admin/TriggerRulesPanel";
import { MessageSequencesPanel } from "@/components/admin/MessageSequencesPanel";
import { cohortEntryLabel, cohortIntakeHint } from "@/lib/cohorts/display";
import type { AppUser, Cohort, Course, LoanVendor } from "@/types/database";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";

type Tab = "courses" | "counselors" | "vendors" | "fees" | "scoring" | "triggers" | "sequences";

export function SettingsClient({
  courses,
  cohorts,
  vendors,
  daysBetween,
  defaultInstallmentCount,
  manualMonthlyAdSpend = 0,
  googleMeetConfigured = false,
  triggerRules = [],
  counselors = [],
  counselorAllocs = [],
  sequences = [],
  leadScoreWeights = {
    interest: 1.5,
    engagement: 1,
    fit: 1,
    timing: 1,
    source: 0.8,
    calling: 1.2,
  },
}: {
  courses: Course[];
  cohorts: Cohort[];
  vendors: LoanVendor[];
  daysBetween: number;
  defaultInstallmentCount: number;
  manualMonthlyAdSpend?: number;
  googleMeetConfigured?: boolean;
  triggerRules?: import("@/app/actions/triggers").StageTriggerRule[];
  counselors?: AppUser[];
  counselorAllocs?: { user_id: string; course_id: string }[];
  sequences?: import("@/app/actions/sequences").SequenceWithSteps[];
  leadScoreWeights?: Record<string, number>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (searchParams.get("tab") as Tab) || "courses";
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [editingCohort, setEditingCohort] = useState<Cohort | null>(null);

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
            ["counselors", "Counselors"],
            ["vendors", "Loan Vendors"],
            ["fees", "Fee Templates"],
            ["scoring", "Lead scoring"],
            ["triggers", "WA + Email triggers"],
            ["sequences", "Program sequences"],
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
            key={editingCohort?.id ?? "new"}
            className="panel space-y-3 p-5"
            onSubmit={(e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              if (editingCohort) {
                fd.set("id", editingCohort.id);
                fd.set("active", editingCohort.active ? "true" : "false");
              } else {
                fd.set("active", "true");
              }
              wrap(async () => {
                const res = await upsertCohort(fd);
                if (res.ok) setEditingCohort(null);
                return res;
              });
            }}
          >
            <p className="eyebrow">
              {editingCohort ? "Edit cohort" : "Add cohort"}
            </p>
            <p className="text-xs text-muted">
              Name cohorts by number (Cohort 1, Cohort 2, …). Set intake dates so
              new leads for this program land in the right cohort by signup date.
            </p>
            <select
              name="course_id"
              className="input-field"
              required
              defaultValue={editingCohort?.course_id ?? courses[0]?.id}
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              name="cohort_number"
              type="number"
              min={1}
              className="input-field"
              placeholder="Cohort number (e.g. 3)"
              required
              defaultValue={editingCohort?.cohort_number ?? undefined}
            />
            <label className="block text-xs text-muted">
              Class start (optional)
              <input
                name="start_date"
                type="date"
                className="input-field mt-1"
                defaultValue={editingCohort?.start_date ?? undefined}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-muted">
                Intake from
                <input
                  name="intake_start"
                  type="date"
                  className="input-field mt-1"
                  defaultValue={editingCohort?.intake_start ?? undefined}
                />
              </label>
              <label className="block text-xs text-muted">
                Intake to
                <input
                  name="intake_end"
                  type="date"
                  className="input-field mt-1"
                  defaultValue={editingCohort?.intake_end ?? undefined}
                />
              </label>
            </div>
            <input
              name="default_total_fee"
              type="number"
              className="input-field"
              placeholder="Default total fee"
              defaultValue={editingCohort?.default_total_fee ?? 350000}
            />
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="btn-primary" disabled={pending}>
                {editingCohort ? "Save cohort" : "Create cohort"}
              </button>
              {editingCohort ? (
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={pending}
                  onClick={() => setEditingCohort(null)}
                >
                  Cancel
                </button>
              ) : null}
            </div>
            <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto border-t border-border pt-4">
              {cohorts.map((c) => {
                const courseName =
                  courses.find((x) => x.id === c.course_id)?.name ?? "Program";
                const selected = editingCohort?.id === c.id;
                return (
                  <li
                    key={c.id}
                    className={`flex items-start justify-between gap-2 rounded-lg px-2 py-1.5 text-sm ${
                      selected ? "bg-periwinkle/10" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="font-medium text-navy">
                        {courseName} · {cohortEntryLabel(c)}
                      </span>
                      <span className="text-muted">
                        {" "}
                        · ₹{Number(c.default_total_fee).toLocaleString("en-IN")}
                        {!c.active ? " · inactive" : ""}
                      </span>
                      {cohortIntakeHint(c) ? (
                        <span className="mt-0.5 block text-[11px] text-muted">
                          {cohortIntakeHint(c)}
                        </span>
                      ) : (
                        <span className="mt-0.5 block text-[11px] text-muted">
                          No intake window
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        className="text-xs font-semibold text-periwinkle hover:underline"
                        onClick={() => setEditingCohort(c)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-xs font-semibold text-rose-600 hover:underline"
                        disabled={pending}
                        onClick={() => {
                          const label = `${courseName} · ${cohortEntryLabel(c)}`;
                          if (
                            !window.confirm(
                              `Delete ${label}?\n\nLeads on this cohort will keep their program but lose the cohort assignment.`
                            )
                          ) {
                            return;
                          }
                          wrap(async () => {
                            const res = await deleteCohort(c.id);
                            if (res.ok && editingCohort?.id === c.id) {
                              setEditingCohort(null);
                            }
                            return res;
                          });
                        }}
                      >
                        Delete
                      </button>
                      <StatusToggle
                        active={c.active}
                        onToggle={() => {
                          const fd = new FormData();
                          fd.set("id", c.id);
                          fd.set("course_id", c.course_id);
                          fd.set(
                            "cohort_number",
                            String(c.cohort_number ?? "")
                          );
                          fd.set("name", c.name);
                          fd.set("start_date", c.start_date ?? "");
                          fd.set("intake_start", c.intake_start ?? "");
                          fd.set("intake_end", c.intake_end ?? "");
                          fd.set(
                            "default_total_fee",
                            String(c.default_total_fee)
                          );
                          fd.set("active", c.active ? "false" : "true");
                          wrap(() => upsertCohort(fd));
                        }}
                      />
                    </div>
                  </li>
                );
              })}
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

      {tab === "scoring" ? (
        <form
          className="panel max-w-lg space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            wrap(async () => {
              const keys = [
                "interest",
                "engagement",
                "fit",
                "timing",
                "source",
                "calling",
              ] as const;
              const value: Record<string, number> = { ...leadScoreWeights };
              for (const key of keys) {
                value[key] = Number(fd.get(key) || 0);
              }
              return updateAppSetting("lead_score_weights", value);
            });
          }}
        >
          <p className="eyebrow">Lead score weights</p>
          <p className="text-sm text-muted">
            Multipliers for conversion likelihood pillars (`app_settings.lead_score_weights`).
          </p>
          {(
            [
              ["interest", "Interest"],
              ["engagement", "Engagement"],
              ["fit", "Fit"],
              ["timing", "Timing"],
              ["source", "Source"],
              ["calling", "Calling"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label className="label-field">{label}</label>
              <input
                name={key}
                type="number"
                step="0.1"
                min={0}
                className="input-field"
                defaultValue={leadScoreWeights[key] ?? 1}
              />
            </div>
          ))}
          <button type="submit" className="btn-primary" disabled={pending}>
            Save score weights
          </button>
        </form>
      ) : null}

      {tab === "triggers" ? <TriggerRulesPanel rules={triggerRules} /> : null}

      {tab === "counselors" ? (
        <CounselorsConfigPanel
          counselors={counselors}
          courses={courses}
          allocs={counselorAllocs}
        />
      ) : null}

      {tab === "sequences" ? (
        <MessageSequencesPanel
          courses={courses}
          triggerRules={triggerRules}
          sequences={sequences}
        />
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
