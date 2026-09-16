export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-56 rounded bg-navy/10" />
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="h-20 rounded-xl bg-navy/5" />
        <div className="h-20 rounded-xl bg-navy/5" />
        <div className="h-20 rounded-xl bg-navy/5" />
        <div className="h-20 rounded-xl bg-navy/5" />
      </div>
      <div className="panel h-72 bg-navy/[0.03]" />
      <p className="text-center text-xs text-muted">Loading…</p>
    </div>
  );
}
