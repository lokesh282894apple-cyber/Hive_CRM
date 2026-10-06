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

function UserEditDrawer({
  user,
  courses,
  cohorts,
  scopes,
  onClose,
  onSaved,
}: {
  user: AppUser;
  courses: Course[];
  cohorts: Cohort[];
  scopes: CounselorScope[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<Role>(user.role as Role);
  const [active, setActive] = useState(user.active);
  const [password, setPassword] = useState("");
  const [picked, setPicked] = useState<string[]>(
    scopes.filter((s) => s.user_id === user.id).map((s) => s.cohort_id)
  );

  const byCourse = courses
    .map((course) => ({ course, cohorts: cohorts.filter((c) => c.course_id === course.id) }))
    .filter((g) => g.cohorts.length);

  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password && password.trim().length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    startTransition(async () => {
      const profile = await updateUserProfile({ id: user.id, name: name.trim() || user.name, role, active });
      if (!profile.ok) return setError(profile.error);
      if (role === "counselor") {
        const next = picked
          .map((cid) => cohorts.find((c) => c.id === cid))
          .filter((c): c is Cohort => Boolean(c))
          .map((c) => ({ course_id: c.course_id, cohort_id: c.id }));
        const scoped = await setCounselorScopes(user.id, next);
        if (!scoped.ok) return setError(scoped.error);
      }
      if (password.trim()) {
        const pw = await resetUserTempPassword({ userId: user.id, password: password.trim() });
        if (!pw.ok) return setError(pw.error);
      }
      onSaved();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-navy/30" onClick={onClose}>
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl"
      >
        <div className="flex items-start justify-between border-b border-border px-5 py-4">
          <div>
            <p className="eyebrow">Edit user</p>
            <p className="text-sm text-muted">{user.email}</p>
          </div>
          <button type="button" className="btn-ghost text-xs" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="flex-1 space-y-4 px-5 py-4">
          <div>
            <label className="label-field">Name</label>
            <input className="input-field" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="label-field">Role</label>
            <select className="input-field" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active (can sign in)
          </label>
          <div>
            <label className="label-field">New temp password</label>
            <input
              className="input-field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave empty to keep the current one"
              minLength={8}
            />
          </div>
          {role === "counselor" ? (
            <div>
              <label className="label-field">Courses / cohorts this counselor works</label>
              <p className="mb-2 text-[11px] text-muted">
                They can open and edit leads of the ticked cohorts that are allocated to them.
              </p>
              <div className="space-y-3 rounded-xl border border-border p-3">
                {byCourse.map(({ course, cohorts: list }) => (
                  <div key={course.id}>
                    <p className="text-xs font-semibold text-navy">{course.name}</p>
                    {list.map((c) => (
                      <label key={c.id} className="mt-1 flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={picked.includes(c.id)}
                          onChange={(e) =>
                            setPicked((prev) =>
                              e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)
                            )
                          }
                        />
                        {c.name}
                        {c.active === false ? <span className="text-[11px] text-muted">(inactive)</span> : null}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
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
  const [editing, setEditing] = useState<AppUser | null>(null);

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
                                const course = courses.find((x) => x.id === s.course_id);
                                return co ? `${course?.name ?? ""} · ${co.name}` : null;
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
                      className="btn-ghost text-xs font-semibold text-navy"
                      onClick={() => setEditing(u)}
                    >
                      Edit
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
                          }
                        });
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editing ? (
        <UserEditDrawer
          key={editing.id}
          user={editing}
          courses={courses}
          cohorts={cohorts}
          scopes={scopes}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setError(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
