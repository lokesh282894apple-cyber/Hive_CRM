"use client";

import {
  createCounselorFromConfig,
  setCounselorPrograms,
} from "@/app/actions/settings";
import type { AppUser, Course } from "@/types/database";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState, useTransition } from "react";

export function CounselorsConfigPanel({
  counselors,
  courses,
  allocs,
}: {
  counselors: AppUser[];
  courses: Course[];
  allocs: { user_id: string; course_id: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {};
    for (const a of allocs) {
      map[a.user_id] = [...(map[a.user_id] ?? []), a.course_id];
    }
    return map;
  });

  const activeCourses = useMemo(
    () => courses.filter((c) => c.active),
    [courses]
  );

  function savePrograms(userId: string) {
    startTransition(async () => {
      const res = await setCounselorPrograms(userId, selected[userId] ?? []);
      setMsg(res.ok ? "Programs saved" : res.error ?? "Error");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form
        className="panel space-y-3 p-5"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const form = e.currentTarget;
          startTransition(async () => {
            const res = await createCounselorFromConfig(new FormData(form));
            setMsg(res.ok ? "Counselor created" : res.error ?? "Error");
            if (res.ok) {
              form.reset();
              router.refresh();
            }
          });
        }}
      >
        <p className="eyebrow">Add counselor</p>
        <p className="text-sm text-muted">
          Creates a counselor login and allocates them to one or more programs.
          New leads for those programs rotate fairly across allocated counselors.
        </p>
        {msg ? <p className="text-sm text-periwinkle">{msg}</p> : null}
        <input name="name" className="input-field" placeholder="Name (e.g. Shreya)" required />
        <input name="email" type="email" className="input-field" placeholder="Email" required />
        <input
          name="password"
          type="text"
          className="input-field"
          placeholder="Temp password"
          required
          minLength={8}
        />
        <fieldset className="space-y-2">
          <legend className="label-field">Programs</legend>
          {activeCourses.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm text-navy">
              <input type="checkbox" name="course_ids" value={c.id} />
              {c.name}
            </label>
          ))}
        </fieldset>
        <button type="submit" className="btn-primary" disabled={pending}>
          Create counselor
        </button>
      </form>

      <div className="panel space-y-4 p-5">
        <p className="eyebrow">Program allocation</p>
        {counselors.length === 0 ? (
          <p className="text-sm text-muted">No counselors yet.</p>
        ) : (
          <ul className="space-y-4">
            {counselors.map((u) => (
              <li key={u.id} className="rounded-xl border border-border p-3">
                <p className="font-medium text-navy">{u.name}</p>
                <p className="text-xs text-muted">{u.email}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {activeCourses.map((c) => {
                    const on = (selected[u.id] ?? []).includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => {
                            setSelected((prev) => {
                              const cur = new Set(prev[u.id] ?? []);
                              if (cur.has(c.id)) cur.delete(c.id);
                              else cur.add(c.id);
                              return { ...prev, [u.id]: Array.from(cur) };
                            });
                          }}
                        />
                        {c.name}
                      </label>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="btn-primary mt-3 px-3 py-1 text-xs"
                  disabled={pending}
                  onClick={() => savePrograms(u.id)}
                >
                  Save programs
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
