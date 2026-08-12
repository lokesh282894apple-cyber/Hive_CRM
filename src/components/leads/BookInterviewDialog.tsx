"use client";

import {
  bookInterview,
  bookInterviewManual,
  getInterviewBookingOptions,
  type BookingOptionsPayload,
} from "@/app/actions/interviews";
import type { InterviewRound, Stage } from "@/lib/constants";
import { cn, formatDateTime } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { Check, Loader2, X } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";

function formatTimeLabel(t: string) {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  const d = new Date();
  d.setHours(h!, m!, 0, 0);
  return format(d, "h:mm a");
}

function roundFromStage(stage: Stage): InterviewRound {
  if (stage.startsWith("r2")) return "R2";
  if (stage.startsWith("r3")) return "R3";
  return "R1";
}

export function BookInterviewDialog({
  leadId,
  leadName,
  targetStage,
  open,
  onClose,
  onBooked,
}: {
  leadId: string;
  leadName: string;
  targetStage: Stage;
  open: boolean;
  onClose: () => void;
  onBooked: (stage: Stage) => void;
}) {
  const round = roundFromStage(targetStage);
  const isReschedule = targetStage.includes("reschedule");
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<BookingOptionsPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [slotId, setSlotId] = useState("");
  const [manualPanelist, setManualPanelist] = useState("");
  const [manualStart, setManualStart] = useState("");
  const [manualDuration, setManualDuration] = useState(30);
  const [mode, setMode] = useState<"slot" | "manual">("slot");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setError(null);
    setSlotId("");
    setManualPanelist("");
    setManualStart("");
    setMode("slot");
    setData(null);

    getInterviewBookingOptions(leadId)
      .then((res) => {
        if (cancelled) return;
        setLoading(false);
        if (!res.ok) {
          setLoadError(res.error);
          setMode("manual");
          return;
        }
        setData(res.data);
        if (res.data.slots.length === 0) setMode("manual");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoading(false);
        setMode("manual");
        setLoadError(
          err instanceof Error ? err.message : "Could not load slots. Use manual booking."
        );
      });

    return () => {
      cancelled = true;
    };
  }, [open, leadId]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, pending, onClose]);

  const freeSlots = useMemo(() => {
    if (!data) return [];
    return data.slots
      .filter((s) => s.status === "free")
      .sort((a, b) => {
        const byDate = a.date.localeCompare(b.date);
        if (byDate !== 0) return byDate;
        return a.start_time.localeCompare(b.start_time);
      });
  }, [data]);

  const byDay = useMemo(() => {
    const map = new Map<string, typeof freeSlots>();
    for (const s of freeSlots) {
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    }
    return Array.from(map.entries()).map(([date, slots]) => ({ date, slots }));
  }, [freeSlots]);

  const selected = freeSlots.find((s) => s.id === slotId) ?? null;
  const rescheduleId =
    isReschedule && data?.existingBookings.find((b) => b.round === round)?.id;

  const interviewers = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of data?.panelists ?? []) map.set(p.id, p.name);
    for (const s of freeSlots) {
      if (s.interviewer?.name) map.set(s.interviewer_id, s.interviewer.name);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data, freeSlots]);

  function bookedStage(): Stage {
    return round === "R1" ? "r1_booked" : round === "R2" ? "r2_booked" : "r3_booked";
  }

  function finishOk() {
    onBooked(bookedStage());
    onClose();
  }

  function confirmSlot() {
    if (!selected) {
      setError("Pick a free slot first.");
      return;
    }
    const scheduledAt = `${selected.date}T${selected.start_time}`;
    startTransition(async () => {
      try {
        const res = await bookInterview({
          leadId,
          round,
          interviewerId: selected.interviewer_id,
          availabilitySlotId: selected.id,
          scheduledAt,
          rescheduleBookingId: rescheduleId || undefined,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        finishOk();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Booking failed");
      }
    });
  }

  function confirmManual() {
    if (!manualPanelist || !manualStart) {
      setError("Panelist and date/time are required.");
      return;
    }
    startTransition(async () => {
      try {
        const res = await bookInterviewManual({
          leadId,
          round,
          interviewerId: manualPanelist,
          startLocal: manualStart,
          durationMinutes: manualDuration,
          rescheduleBookingId: rescheduleId || undefined,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        finishOk();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Booking failed");
      }
    });
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-navy/50 backdrop-blur-[2px]"
        aria-label="Close"
        disabled={pending}
        onClick={() => !pending && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="book-interview-title"
        className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-white shadow-2xl sm:mx-4 sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
              Book {round}
              {isReschedule ? " · reschedule" : ""}
            </p>
            <h2
              id="book-interview-title"
              className="mt-0.5 truncate text-lg font-semibold text-navy"
            >
              {leadName}
            </h2>
            <p className="mt-1 text-xs text-muted">
              Pick a slot or set panelist + time — then this lead moves to {round} Booked.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-muted hover:bg-[#F7F8FC] hover:text-navy"
            disabled={pending}
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading slots…
            </div>
          ) : (
            <>
              <div className="mb-4 flex gap-1 rounded-xl border border-border p-1">
                <button
                  type="button"
                  className={cn(
                    "flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold",
                    mode === "slot"
                      ? "bg-navy text-white"
                      : "text-muted hover:text-navy"
                  )}
                  onClick={() => setMode("slot")}
                >
                  Free slots ({freeSlots.length})
                </button>
                <button
                  type="button"
                  className={cn(
                    "flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold",
                    mode === "manual"
                      ? "bg-navy text-white"
                      : "text-muted hover:text-navy"
                  )}
                  onClick={() => setMode("manual")}
                >
                  Manual override
                </button>
              </div>

              {loadError ? (
                <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {loadError}
                </p>
              ) : null}

              {error ? (
                <p className="mb-3 rounded-xl border border-danger/30 bg-red-50 px-3 py-2 text-sm text-danger">
                  {error}
                </p>
              ) : null}

              {mode === "slot" ? (
                freeSlots.length === 0 ? (
                  <div className="rounded-xl border border-border bg-[#F7F8FC] px-4 py-6 text-center">
                    <p className="text-sm text-navy">No free slots in the next 7 days.</p>
                    <button
                      type="button"
                      className="mt-3 text-xs font-semibold text-periwinkle hover:underline"
                      onClick={() => setMode("manual")}
                    >
                      Use manual override →
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {byDay.map(({ date, slots }) => (
                      <div key={date}>
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                          {format(parseISO(date), "EEE, MMM d")}
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {slots.map((s) => {
                            const active = slotId === s.id;
                            return (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => setSlotId(s.id)}
                                className={cn(
                                  "rounded-xl border px-3 py-2.5 text-left transition",
                                  active
                                    ? "border-navy bg-navy text-white"
                                    : "border-border bg-white hover:border-gold"
                                )}
                              >
                                <p className="text-sm font-bold">
                                  {formatTimeLabel(s.start_time)}
                                </p>
                                <p
                                  className={cn(
                                    "mt-0.5 truncate text-xs",
                                    active ? "text-white/75" : "text-muted"
                                  )}
                                >
                                  {s.interviewer?.name ?? "Interviewer"}
                                </p>
                                {active ? (
                                  <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-eyebrow text-gold">
                                    <Check className="h-3 w-3" /> Selected
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div className="grid gap-3">
                  <div>
                    <label className="label-field">Panelist</label>
                    <select
                      className="input-field"
                      value={manualPanelist}
                      onChange={(e) => setManualPanelist(e.target.value)}
                    >
                      <option value="">Select panelist</option>
                      {interviewers.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label-field">Date & time</label>
                    <input
                      type="datetime-local"
                      className="input-field"
                      value={manualStart}
                      onChange={(e) => setManualStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label-field">Duration (minutes)</label>
                    <input
                      type="number"
                      min={15}
                      max={180}
                      step={15}
                      className="input-field"
                      value={manualDuration}
                      onChange={(e) => setManualDuration(Number(e.target.value) || 30)}
                    />
                  </div>
                </div>
              )}

              {data?.existingBookings.length ? (
                <div className="mt-4 border-t border-border pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-muted">
                    Existing bookings
                  </p>
                  <ul className="mt-2 space-y-1">
                    {data.existingBookings.map((b) => (
                      <li key={b.id} className="text-xs text-muted">
                        {b.round} · {formatDateTime(b.scheduled_at)} ·{" "}
                        {b.outcome ?? "pending"}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            className="btn-secondary text-xs"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-2 text-xs"
            disabled={pending || loading}
            onClick={mode === "slot" ? confirmSlot : confirmManual}
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Confirm {round} booking
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
