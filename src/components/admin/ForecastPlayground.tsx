"use client";

import { useMemo, useState } from "react";
import { HoverLineChart } from "@/components/charts/HoverLineChart";
import { ForecastBadge } from "@/components/charts/SimpleCharts";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";

export type ForecastBaseline = {
  confidence: "low" | "medium" | "high";
  confidenceReason: string;
  cohortName: string | null;
  todayKey: string;
  historyLeads: { date: string; value: number }[];
  historyWins: { date: string; value: number }[];
  fillHistory: { date: string; value: number }[];
  defaults: {
    yieldRate: number;
    leadsPerDay: number;
    winsPerDay: number;
    seats: number;
    daysLeft: number;
    avgTicket: number;
    focusWon: number;
    focusOpen: number;
  };
};

function addDays(isoDate: string, n: number) {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
  display: string;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-navy">{label}</span>
        <span className="tabular-nums text-xs font-semibold text-periwinkle">
          {display}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-periwinkle"
      />
      {hint ? <p className="mt-0.5 text-[11px] text-muted">{hint}</p> : null}
    </label>
  );
}

export function ForecastPlayground({
  baseline,
  rangeDays,
}: {
  baseline: ForecastBaseline;
  rangeDays: number;
}) {
  const d = baseline.defaults;
  const [yieldRate, setYieldRate] = useState(Math.round(d.yieldRate * 10) / 10);
  const [leadsPerDay, setLeadsPerDay] = useState(
    Math.round(d.leadsPerDay * 10) / 10
  );
  const [winsPerDay, setWinsPerDay] = useState(Math.round(d.winsPerDay * 100) / 100);
  const [seats, setSeats] = useState(Math.max(1, d.seats || 40));
  const [daysLeft, setDaysLeft] = useState(Math.max(7, Math.min(90, d.daysLeft || 30)));
  const [avgTicket, setAvgTicket] = useState(Math.round(d.avgTicket || 150000));
  const [openPipeline, setOpenPipeline] = useState(d.focusOpen);
  const [linkWinsToYield, setLinkWinsToYield] = useState(true);

  function reset() {
    setYieldRate(Math.round(d.yieldRate * 10) / 10);
    setLeadsPerDay(Math.round(d.leadsPerDay * 10) / 10);
    setWinsPerDay(Math.round(d.winsPerDay * 100) / 100);
    setSeats(Math.max(1, d.seats || 40));
    setDaysLeft(Math.max(7, Math.min(90, d.daysLeft || 30)));
    setAvgTicket(Math.round(d.avgTicket || 150000));
    setOpenPipeline(d.focusOpen);
    setLinkWinsToYield(true);
  }

  const effectiveWinsPerDay = linkWinsToYield
    ? leadsPerDay * (yieldRate / 100)
    : winsPerDay;

  const model = useMemo(() => {
    const yieldFrac = yieldRate / 100;
    const fromPipeline = openPipeline * yieldFrac;
    const projected =
      d.focusWon + fromPipeline + effectiveWinsPerDay * daysLeft;
    const band =
      baseline.confidence === "high"
        ? 0.08
        : baseline.confidence === "medium"
          ? 0.18
          : 0.35;
    const low = Math.max(d.focusWon, projected * (1 - band));
    const high = projected * (1 + band);
    const fillPct = seats > 0 ? (projected / seats) * 100 : null;
    let verdict: "on_track" | "at_risk" | "off_track" | "unset" = "unset";
    if (seats > 0) {
      if ((fillPct ?? 0) >= 95) verdict = "on_track";
      else if ((fillPct ?? 0) >= 70) verdict = "at_risk";
      else verdict = "off_track";
    }
    const projectedFee = projected * avgTicket;

    const forecastLeads: { date: string; value: number }[] = [];
    const forecastWins: { date: string; value: number }[] = [];
    for (let i = 1; i <= daysLeft; i++) {
      const date = addDays(baseline.todayKey, i);
      forecastLeads.push({ date, value: leadsPerDay });
      forecastWins.push({ date, value: effectiveWinsPerDay });
    }

    const remaining = Math.max(0, projected - d.focusWon);
    const fillForecast: { date: string; value: number }[] = [];
    const fillLow: { date: string; value: number }[] = [];
    const fillHigh: { date: string; value: number }[] = [];
    const targetLine: { date: string; value: number }[] = [];
    for (let i = 1; i <= daysLeft; i++) {
      const date = addDays(baseline.todayKey, i);
      const v = d.focusWon + (remaining * i) / daysLeft;
      fillForecast.push({ date, value: v });
      fillLow.push({
        date,
        value: d.focusWon + ((low - d.focusWon) * i) / daysLeft,
      });
      fillHigh.push({
        date,
        value: d.focusWon + ((high - d.focusWon) * i) / daysLeft,
      });
      targetLine.push({ date, value: seats });
    }
    const targetFull = [
      ...baseline.fillHistory.map((p) => ({ date: p.date, value: seats })),
      ...targetLine,
    ];

    return {
      projected,
      low,
      high,
      fillPct,
      verdict,
      projectedFee,
      fromPipeline,
      forecastLeads,
      forecastWins,
      fillForecast,
      fillLow,
      fillHigh,
      targetFull,
    };
  }, [
    yieldRate,
    leadsPerDay,
    effectiveWinsPerDay,
    seats,
    daysLeft,
    avgTicket,
    openPipeline,
    d.focusWon,
    baseline.confidence,
    baseline.todayKey,
    baseline.fillHistory,
  ]);

  const verdictStyles =
    model.verdict === "on_track"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : model.verdict === "at_risk"
        ? "bg-amber-50 text-amber-900 border-amber-200"
        : model.verdict === "off_track"
          ? "bg-red-50 text-red-800 border-red-200"
          : "bg-navy/[0.03] text-muted border-border";

  const verdictLabel =
    model.verdict === "on_track"
      ? "On track"
      : model.verdict === "at_risk"
        ? "At risk"
        : model.verdict === "off_track"
          ? "Off track"
          : "Set seats";

  const dim = baseline.confidence === "low";

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="panel h-fit space-y-5 p-5 lg:sticky lg:top-4">
          <div>
            <p className="eyebrow">Playground</p>
            <h2 className="mt-1 text-sm font-semibold text-navy">
              Tweak assumptions
            </h2>
            <p className="mt-1 text-xs text-muted">
              Charts update live. Baseline from last {rangeDays}d
              {baseline.cohortName ? ` · ${baseline.cohortName}` : ""}.
            </p>
          </div>

          <Slider
            label="Yield rate"
            hint="Won ÷ closed — also drives open-pipeline conversion"
            value={yieldRate}
            min={0}
            max={60}
            step={0.5}
            onChange={setYieldRate}
            display={`${yieldRate.toFixed(1)}%`}
          />
          <Slider
            label="New leads / day"
            hint="Forward daily lead pace"
            value={leadsPerDay}
            min={0}
            max={40}
            step={0.1}
            onChange={setLeadsPerDay}
            display={leadsPerDay.toFixed(1)}
          />

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-navy">Wins / day</span>
            <label className="inline-flex items-center gap-1.5 text-[11px] text-muted">
              <input
                type="checkbox"
                checked={linkWinsToYield}
                onChange={(e) => setLinkWinsToYield(e.target.checked)}
                className="rounded border-border"
              />
              Link to yield × leads
            </label>
          </div>
          {linkWinsToYield ? (
            <p className="tabular-nums text-xs font-semibold text-periwinkle">
              {effectiveWinsPerDay.toFixed(2)} / day
            </p>
          ) : (
            <Slider
              label="Wins / day"
              value={winsPerDay}
              min={0}
              max={10}
              step={0.05}
              onChange={setWinsPerDay}
              display={winsPerDay.toFixed(2)}
            />
          )}

          <Slider
            label="Open pipeline"
            hint="Leads still open that can convert"
            value={openPipeline}
            min={0}
            max={Math.max(50, d.focusOpen * 2, 20)}
            step={1}
            onChange={setOpenPipeline}
            display={String(openPipeline)}
          />
          <Slider
            label="Seat target"
            value={seats}
            min={5}
            max={Math.max(120, seats)}
            step={1}
            onChange={setSeats}
            display={String(seats)}
          />
          <Slider
            label="Days to project"
            hint="Horizon for dashed forecast lines"
            value={daysLeft}
            min={7}
            max={90}
            step={1}
            onChange={setDaysLeft}
            display={`${daysLeft}d`}
          />
          <Slider
            label="Avg ticket (₹)"
            hint="For projected fee"
            value={avgTicket}
            min={25000}
            max={500000}
            step={5000}
            onChange={setAvgTicket}
            display={formatCurrency(avgTicket)}
          />

          <button
            type="button"
            onClick={reset}
            className="w-full rounded-xl border border-border px-3 py-2 text-xs font-semibold text-navy hover:bg-[#F7F8FC]"
          >
            Reset to baseline
          </button>
        </aside>

        <div className="space-y-6">
          <section className="panel p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-eyebrow ${verdictStyles}`}
                >
                  {verdictLabel}
                </span>
                <ForecastBadge
                  confidence={baseline.confidence}
                  reason={baseline.confidenceReason}
                />
              </div>
              <Link
                href="/admin/config?tab=fees"
                className="text-xs font-semibold text-periwinkle hover:underline"
              >
                Edit seat targets →
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                  Projected fill
                </p>
                <p className="mt-1 text-2xl font-semibold text-navy">
                  {Math.round(model.projected)}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  Band {Math.round(model.low)}–{Math.round(model.high)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                  Fill vs seats
                </p>
                <p className="mt-1 text-2xl font-semibold text-navy">
                  {model.fillPct != null ? `${model.fillPct.toFixed(0)}%` : "—"}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {d.focusWon} won now · {seats} seats
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                  From open
                </p>
                <p className="mt-1 text-2xl font-semibold text-navy">
                  +{Math.round(model.fromPipeline)}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {openPipeline} open × {yieldRate.toFixed(0)}% yield
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                  Projected fee
                </p>
                <p className="mt-1 text-2xl font-semibold text-navy">
                  {formatCurrency(model.projectedFee)}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  × {formatCurrency(avgTicket)} ticket
                </p>
              </div>
            </div>
          </section>

          <section className="panel overflow-hidden">
            <div className="border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold text-navy">Enrollment pulse</h2>
              <p className="mt-0.5 text-xs text-muted">
                History (solid) · your pace forward (dashed) · hover for day values
              </p>
            </div>
            <div className="p-5">
              <HoverLineChart
                height={240}
                series={[
                  {
                    id: "leads",
                    label: "Leads",
                    color: "#4F46E5",
                    points: baseline.historyLeads,
                  },
                  {
                    id: "wins",
                    label: "Wins",
                    color: "#C9A227",
                    points: baseline.historyWins,
                  },
                  {
                    id: "leads-f",
                    label: "Leads forecast",
                    color: "#4F46E5",
                    points: model.forecastLeads,
                    dashed: true,
                    dim,
                  },
                  {
                    id: "wins-f",
                    label: "Wins forecast",
                    color: "#C9A227",
                    points: model.forecastWins,
                    dashed: true,
                    dim,
                  },
                ]}
              />
            </div>
          </section>

          <section className="panel overflow-hidden">
            <div className="border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold text-navy">Cohort fill path</h2>
              <p className="mt-0.5 text-xs text-muted">
                Cumulative won · projected · confidence band · seat target · hover for
                numbers
              </p>
            </div>
            <div className="p-5">
              <HoverLineChart
                height={260}
                series={[
                  {
                    id: "fill",
                    label: "Cumulative won",
                    color: "#0F2744",
                    points: baseline.fillHistory,
                  },
                  {
                    id: "fill-f",
                    label: "Projected",
                    color: "#4F46E5",
                    points: model.fillForecast,
                    dashed: true,
                    dim,
                  },
                  {
                    id: "low",
                    label: "Low band",
                    color: "#94A3B8",
                    points: model.fillLow,
                    dashed: true,
                    dim: true,
                  },
                  {
                    id: "high",
                    label: "High band",
                    color: "#94A3B8",
                    points: model.fillHigh,
                    dashed: true,
                    dim: true,
                  },
                  {
                    id: "target",
                    label: `Target ${seats}`,
                    color: "#059669",
                    points: model.targetFull,
                    dashed: true,
                  },
                ]}
              />
            </div>
          </section>

          <section className="panel overflow-hidden">
            <div className="border-b border-border px-5 py-3.5">
              <h2 className="text-sm font-semibold text-navy">Day table</h2>
              <p className="mt-0.5 text-xs text-muted">
                Next {Math.min(14, daysLeft)} forecast days at your current pace
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-navy/[0.02]">
                  <tr>
                    <th className="eyebrow px-5 py-2.5">Date</th>
                    <th className="eyebrow px-4 py-2.5 text-right">Leads (fcst)</th>
                    <th className="eyebrow px-4 py-2.5 text-right">Wins (fcst)</th>
                    <th className="eyebrow px-5 py-2.5 text-right">Cum. fill</th>
                  </tr>
                </thead>
                <tbody>
                  {model.fillForecast.slice(0, 14).map((row, i) => (
                    <tr
                      key={row.date}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-5 py-2.5 font-medium text-navy">
                        {new Date(row.date + "T12:00:00").toLocaleDateString(
                          "en-IN",
                          { day: "numeric", month: "short" }
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted">
                        {model.forecastLeads[i]?.value.toFixed(1) ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted">
                        {model.forecastWins[i]?.value.toFixed(2) ?? "—"}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-navy">
                        {row.value.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
