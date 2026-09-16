export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-48 rounded bg-navy/10" />
      <div className="panel h-64 bg-navy/[0.03]" />
      <p className="text-center text-xs text-muted">Loading…</p>
    </div>
  );
}
