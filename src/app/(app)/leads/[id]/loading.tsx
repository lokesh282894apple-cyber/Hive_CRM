export default function LeadDetailLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-48 rounded-lg bg-navy/10" />
      <div className="h-4 w-72 rounded bg-navy/5" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-64 rounded-2xl border border-border bg-white lg:col-span-2" />
        <div className="h-64 rounded-2xl border border-border bg-white" />
      </div>
    </div>
  );
}
