export default function MarketingDashboardLoading() {
  return (
    <div className="space-y-4 p-1">
      <div className="h-8 w-48 animate-pulse rounded bg-navy/10" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-navy/5" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-navy/5" />
    </div>
  );
}
