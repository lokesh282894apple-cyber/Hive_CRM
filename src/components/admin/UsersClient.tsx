"use client";

import { createUserAccount, setCounselorScopes, updateUserProfile } from "@/app/actions/users";
import { ROLES, type Role } from "@/lib/constants";
import { StatusBadge } from "@/components/ui/Primitives";
import type { AppUser, Cohort, CounselorScope, Course } from "@/types/database";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

export function UsersClient({
  users,
  courses,
  cohorts,
  scopes,
}: {
  users: AppUser[];
  courses: Course[];
  cohorts: Cohort[];
  scopes: CounselorScope[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("counselor");
  const [selectedCohorts, setSelectedCohorts] = useState<string[]>([]);

  function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createUserAccount({
        name: String(fd.get("name")),
        email: String(fd.get("email")),
        password: String(fd.get("password")),
        role,
        cohortIds: selectedCohorts,
      });
      if (!res.ok) setError(res.error);
      else {
        setError(null);
        (e.target as HTMLFormElement).reset();
        setSelectedCohorts([]);
        router.refresh();
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <form onSubmit={onCreate} className="panel space-y-3 p-5 lg:col-span-2">
        <p className="eyebrow">Add user</p>
        <div>
          <label className="label-field">Name</label>
          <input name="name" className="input-field" required />
        </div>
        <div>
          <label className="label-field">Email</label>
          <input name="email" type="email" className="input-field" required />
        </div>
        <div>
          <label className="label-field">Temp password</label>
          <input name="password" type="text" className="input-field" required minLength={8} />
        </div>
        <div>
          <label className="label-field">Role</label>
          <select
            className="input-field"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        {role === "counselor" ? (
          <div>
            <label className="label-field">Course / cohort scope</label>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
              {cohorts.map((c) => {
                const course = courses.find((x) => x.id === c.course_id);
                const checked = selectedCohorts.includes(c.id);
                return (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setSelectedCohorts((prev) =>
                          e.target.checked
                            ? [...prev, c.id]
                            : prev.filter((id) => id !== c.id)
                        )
                      }
                    />
                    {course?.name} · {c.name}
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <button type="submit" className="btn-primary" disabled={pending}>
          Create user
        </button>
      </form>

      <div className="panel overflow-hidden lg:col-span-3">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-navy/[0.02]">
            <tr>
              <th className="eyebrow px-4 py-3">User</th>
              <th className="eyebrow px-4 py-3">Role</th>
              <th className="eyebrow px-4 py-3">Status</th>
              <th className="eyebrow px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const userScopes = scopes.filter((s) => s.user_id === u.id);
              return (
                <tr key={u.id} className="border-b border-border last:border-0 align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-navy">{u.name}</p>
                    <p className="text-xs text-muted">{u.email}</p>
                    {u.role === "counselor" ? (
                      <p className="mt-1 text-xs text-muted">
                        Scope:{" "}
                        {userScopes.length
                          ? userScopes
                              .map((s) => {
                                const co = cohorts.find((c) => c.id === s.cohort_id);
                                return co?.name;
                              })
                              .filter(Boolean)
                              .join(", ")
                          : "none"}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="input-field py-1.5 text-xs"
                      defaultValue={u.role}
                      disabled={pending}
                      onChange={(e) =>
                        startTransition(async () => {
                          await updateUserProfile({
                            id: u.id,
                            name: u.name,
                            role: e.target.value as Role,
                            active: u.active,
                          });
                          router.refresh();
                        })
                      }
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      label={u.active ? "Active" : "Inactive"}
                      tone={u.active ? "green" : "gray"}
                    />
                  </td>
                  <td className="px-4 py-3 space-y-2">
                    <button
                      type="button"
                      className="btn-ghost text-xs"
                      onClick={() =>
                        startTransition(async () => {
                          await updateUserProfile({
                            id: u.id,
                            name: u.name,
                            role: u.role,
                            active: !u.active,
                          });
                          router.refresh();
                        })
                      }
                    >
                      {u.active ? "Deactivate" : "Activate"}
                    </button>
                    {u.role === "counselor" ? (
                      <button
                        type="button"
                        className="btn-ghost block text-xs text-periwinkle"
                        onClick={() => {
                          const ids = prompt(
                            "Comma-separated cohort IDs for scope (leave empty to clear)",
                            userScopes.map((s) => s.cohort_id).join(",")
                          );
                          if (ids == null) return;
                          const cohortIds = ids
                            .split(",")
                            .map((x) => x.trim())
                            .filter(Boolean);
                          const next = cohortIds
                            .map((cid) => {
                              const co = cohorts.find((c) => c.id === cid);
                              return co
                                ? { course_id: co.course_id, cohort_id: co.id }
                                : null;
                            })
                            .filter(Boolean) as { course_id: string; cohort_id: string }[];
                          startTransition(async () => {
                            await setCounselorScopes(u.id, next);
                            router.refresh();
                          });
                        }}
                      >
                        Edit scope
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
