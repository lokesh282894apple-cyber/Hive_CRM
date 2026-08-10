export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-3 w-28 rounded bg-navy/10" />
        <div className="h-8 w-56 rounded bg-navy/10" />
        <div className="h-4 w-80 max-w-full rounded bg-navy/5" />
      </div>
      <div className="panel h-40 p-5">
        <div className="h-3 w-24 rounded bg-navy/10" />
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <div className="h-16 rounded-xl bg-navy/5" />
          <div className="h-16 rounded-xl bg-navy/5" />
          <div className="h-16 rounded-xl bg-navy/5" />
          <div className="h-16 rounded-xl bg-navy/5" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="panel h-48 bg-navy/[0.03]" />
        <div className="panel h-48 bg-navy/[0.03]" />
        <div className="panel h-48 bg-navy/[0.03]" />
      </div>
      <p className="text-center text-xs text-muted">Loading…</p>
    </div>
  );
}
