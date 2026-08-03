"use client";

import { addAvailabilitySlot, removeAvailabilitySlot } from "@/app/actions/interviews";
import { cn, formatDate } from "@/lib/utils";
import type { InterviewerAvailability } from "@/types/database";
import {
  addDays,
  eachDayOfInterval,
  format,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState, useTransition } from "react";

const HOURS = Array.from({ length: 11 }, (_, i) => i + 9); // 9–19

function timeInHour(slot: InterviewerAvailability, hour: number) {
  const startH = Number(slot.start_time.slice(0, 2));
  return startH === hour;
}

export function AvailabilityClient({ slots }: { slots: InterviewerAvailability[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const days = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) }),
    [weekStart]
  );

  const slotsByDay = useMemo(() => {
    const map = new Map<string, InterviewerAvailability[]>();
    for (const s of slots) {
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    }
    return map;
  }, [slots]);

  function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await addAvailabilitySlot(fd);
      (e.target as HTMLFormElement).reset();
      router.refresh();
    });
  }

  function quickAdd(day: Date, hour: number) {
    const fd = new FormData();
    fd.set("date", format(day, "yyyy-MM-dd"));
    fd.set("start_time", `${String(hour).padStart(2, "0")}:00`);
    fd.set("end_time", `${String(hour + 1).padStart(2, "0")}:00`);
    startTransition(async () => {
      await addAvailabilitySlot(fd);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow">Week view</p>
          <h2 className="text-lg font-semibold text-navy">
            {format(weekStart, "MMM d")} – {format(addDays(weekStart, 6), "MMM d, yyyy")}
          </h2>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            className="btn-secondary px-3"
            onClick={() => setWeekStart((d) => addDays(d, -7))}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
          >
            This week
          </button>
          <button
            type="button"
            className="btn-secondary px-3"
            onClick={() => setWeekStart((d) => addDays(d, 7))}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="panel overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-border">
            <div className="p-2" />
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const count = slotsByDay.get(key)?.length ?? 0;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDate(key)}
                  className={cn(
                    "border-l border-border px-2 py-3 text-center transition",
                    selectedDate === key ? "bg-navy text-white" : "hover:bg-navy/5"
                  )}
                >
                  <p className="eyebrow text-[10px] opacity-70">{format(day, "EEE")}</p>
                  <p className="text-sm font-semibold">{format(day, "d")}</p>
                  <p className="text-[10px] opacity-70">{count} slots</p>
                </button>
              );
            })}
          </div>

          {HOURS.map((hour) => (
            <div
              key={hour}
              className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-border last:border-0"
            >
              <div className="flex items-start justify-end px-2 py-2 text-[11px] text-muted">
                {format(new Date().setHours(hour, 0, 0, 0), "h a")}
              </div>
              {days.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const daySlots = (slotsByDay.get(key) ?? []).filter((s) =>
                  timeInHour(s, hour)
                );
                return (
                  <div
                    key={key + hour}
                    className="min-h-[52px] border-l border-border p-1"
                  >
                    {daySlots.map((s) => (
                      <div
                        key={s.id}
                        className={cn(
                          "mb-1 rounded-lg px-1.5 py-1 text-[10px] font-medium",
                          s.status === "booked"
                            ? "bg-slate-200 text-slate-600"
                            : "bg-periwinkle/20 text-navy"
                        )}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span>
                            {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                          </span>
                          {s.status === "free" ? (
                            <button
                              type="button"
                              className="text-danger"
                              disabled={pending}
                              onClick={() =>
                                startTransition(async () => {
                                  await removeAvailabilitySlot(s.id);
                                  router.refresh();
                                })
                              }
                            >
                              ×
                            </button>
                          ) : (
                            <span className="uppercase tracking-eyebrow">Booked</span>
                          )}
                        </div>
                      </div>
                    ))}
                    {daySlots.length === 0 ? (
                      <button
                        type="button"
                        className="h-full w-full rounded-lg text-[10px] text-muted opacity-0 transition hover:bg-gold/20 hover:opacity-100"
                        disabled={pending}
                        onClick={() => quickAdd(day, hour)}
                        title="Add 1h free slot"
                      >
                        + Add
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={onAdd} className="panel grid gap-3 p-5 sm:grid-cols-4">
        <p className="eyebrow sm:col-span-4">Add custom slot</p>
        <div>
          <label className="label-field">Date</label>
          <input
            name="date"
            type="date"
            className="input-field"
            required
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>
        <div>
          <label className="label-field">Start</label>
          <input name="start_time" type="time" className="input-field" required defaultValue="10:00" />
        </div>
        <div>
          <label className="label-field">End</label>
          <input name="end_time" type="time" className="input-field" required defaultValue="11:00" />
        </div>
        <div className="flex items-end">
          <button type="submit" className="btn-primary w-full" disabled={pending}>
            Add slot
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-4">
          <input name="recurring" type="checkbox" /> Recurring weekly (flag only for now)
        </label>
        <p className="text-xs text-muted sm:col-span-4">
          Tip: hover an empty cell on the week grid and click <strong>+ Add</strong> for a 1-hour free
          slot ({formatDate(selectedDate)} selected).
        </p>
      </form>
    </div>
  );
}
