"use client";

import { useEffect, useState } from "react";

type Toast = { id: number; message: string; tone: "error" | "success" };

const EVENT = "hive:toast";

/** Show a short message at the bottom of the screen. */
export function notify(message: string, tone: Toast["tone"] = "error") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, tone } }));
}

/**
 * Surface a server-action result: shows the error when it failed, so a save
 * never fails silently. Returns the result unchanged.
 */
export function reportResult<T extends { ok: boolean; error?: string }>(
  res: T | void | null | undefined,
  successMessage?: string
): T | void | null | undefined {
  if (res && !res.ok) notify(res.error || "Couldn't save — please try again.");
  else if (res && successMessage) notify(successMessage, "success");
  return res;
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let seq = 0;
    const onToast = (e: Event) => {
      const { message, tone } = (e as CustomEvent<Omit<Toast, "id">>).detail;
      const id = ++seq;
      setToasts((list) => [...list.slice(-3), { id, message, tone }]);
      setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), tone === "error" ? 7000 : 3000);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className={`pointer-events-auto max-w-md rounded-xl px-4 py-2.5 text-sm text-white shadow-lg ${
            t.tone === "error" ? "bg-danger" : "bg-success"
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
