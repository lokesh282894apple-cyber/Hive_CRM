"use client";

import {
  createUserAccount,
  deleteUserAccount,
  generateMissingTempPasswords,
  generateUserTempPassword,
  resetUserTempPassword,
  setCounselorScopes,
  updateUserProfile,
} from "@/app/actions/users";
import { ROLES, type Role } from "@/lib/constants";
import { viewAsHome, VIEW_AS_ROLES } from "@/lib/impersonation";
import { StatusBadge } from "@/components/ui/Primitives";
import type { AppUser, Cohort, CounselorScope, Course } from "@/types/database";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

function PasswordCell({
  password,
  pending,
  onGenerate,
}: {
  password: string | null | undefined;
  pending: boolean;
  onGenerate: () => void;
}) {
  const [show, setShow] = useState(false);
  if (!password) {
    return (
      <div className="flex flex-col gap-1">
        <span
          className="text-xs text-muted"
          title="Auth only stores hashes — old passwords cannot be recovered"
        >
          Not stored
        </span>
        <button
          type="button"
          className="text-left text-[11px] font-semibold text-periwinkle hover:underline disabled:opacity-50"
          disabled={pending}
          onClick={onGenerate}
        >
          Generate
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <code className="rounded bg-navy/5 px-1.5 py-0.5 font-mono text-xs text-navy">
        {show ? password : "••••••••"}
      </code>
      <button
        type="button"
        className="text-[11px] font-semibold text-periwinkle hover:underline"
        onClick={() => setShow((s) => !s)}
      >
        {show ? "Hide" : "Show"}
      </button>
      <button
        type="button"
        className="text-[11px] font-semibold text-muted hover:underline"
        onClick={() => {
          void navigator.clipboard.writeText(password);
        }}
      >
        Copy
      </button>
    </div>
  );
}

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
          <p className="mt-1 text-[11px] text-muted">
            Saved for admin view until the user changes it.
          </p>
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
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
          <p className="text-xs text-muted">
            Shows the last admin-set temp password. Older accounts show “Not stored” because
            Auth never keeps recoverable hashes — use Generate to create a visible one.
          </p>
          <button
            type="button"
            className="btn-ghost shrink-0 text-xs"
            disabled={pending || users.every((u) => u.admin_temp_password)}
            onClick={() => {
              if (
                !confirm(
                  "Generate new temp passwords for every active user without one? Their current login password will be replaced and they must change it on next login."
                )
              ) {
                return;
              }
              startTransition(async () => {
                const res = await generateMissingTempPasswords();
                if (!res.ok) setError(res.error);
                else {
                  setError(null);
                  router.refresh();
                }
              });
            }}
          >
            Generate missing passwords
          </button>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-navy/[0.02]">
            <tr>
              <th className="eyebrow px-4 py-3">User</th>
              <th className="eyebrow px-4 py-3">Password</th>
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
                    {u.must_change_password ? (
                      <p className="mt-1 text-[11px] font-semibold text-amber-800">
                        Must change password
                      </p>
                    ) : null}
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
                    <PasswordCell
                      password={u.admin_temp_password}
                      pending={pending}
                      onGenerate={() => {
                        startTransition(async () => {
                          const res = await generateUserTempPassword(u.id);
                          if (!res.ok) setError(res.error);
                          else {
                            setError(null);
                            router.refresh();
                          }
                        });
                      }}
                    />
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
                      disabled={pending}
                      onClick={() => {
                        const next = prompt(
                          `New temp password for ${u.name} (min 8 chars)`,
                          u.admin_temp_password || ""
                        );
                        if (next == null) return;
                        if (next.trim().length < 8) {
                          setError("Password must be at least 8 characters.");
                          return;
                        }
                        startTransition(async () => {
                          const res = await resetUserTempPassword({
                            userId: u.id,
                            password: next.trim(),
                          });
                          if (!res.ok) setError(res.error);
                          else {
                            setError(null);
                            router.refresh();
                          }
                        });
                      }}
                    >
                      Set password
                    </button>
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
                    {u.active &&
                    VIEW_AS_ROLES.includes(u.role as (typeof VIEW_AS_ROLES)[number]) ? (
                      <a
                        href={viewAsHome(u.id, u.role)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-ghost block text-xs text-periwinkle"
                      >
                        View as
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="btn-ghost block text-xs text-danger"
                      disabled={pending}
                      onClick={() => {
                        if (
                          !confirm(
                            `Remove ${u.name} (${u.email})?\n\nThey will be deactivated.\nTheir leads stay in the CRM but become unassigned so you can reassign them.`
                          )
                        ) {
                          return;
                        }
                        startTransition(async () => {
                          const res = await deleteUserAccount(u.id);
                          if (!res.ok) setError(res.error);
                          else {
                            setError(null);
                            router.refresh();
                          }
                        });
                      }}
                    >
                      Remove
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
                        Edit scope IDs
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
