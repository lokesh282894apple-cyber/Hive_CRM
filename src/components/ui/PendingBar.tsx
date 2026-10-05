"use client";

/**
 * Thin animated bar across the top of the screen while a filter change is
 * loading — the page keeps the old results until the new ones arrive, so
 * without this it looked frozen.
 */
export function PendingBar({ active, label = "Loading…" }: { active: boolean; label?: string }) {
  if (!active) return null;
  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden bg-periwinkle/20" role="progressbar" aria-label={label}>
        <div className="h-full w-1/3 animate-[pendingbar_1.1s_ease-in-out_infinite] rounded-full bg-periwinkle" />
      </div>
      <div className="pointer-events-none fixed right-4 top-3 z-[100] rounded-full bg-navy px-3 py-1 text-xs font-medium text-white shadow-lg">
        {label}
      </div>
    </>
  );
}
