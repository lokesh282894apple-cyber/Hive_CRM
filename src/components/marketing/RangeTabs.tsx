import Link from "next/link";
import type { RangeKey } from "@/lib/marketing/queries";

export function RangeTabs({
  basePath,
  range,
  extra = "",
}: {
  basePath: string;
  range: RangeKey;
  extra?: string;
}) {
  const ranges: RangeKey[] = ["7", "30", "90"];
  return (
    <div className="flex gap-1 rounded-xl border border-border p-1">
      {ranges.map((r) => (
        <Link
          key={r}
          href={`${basePath}?range=${r}${extra}`}
          className={
            r === range
              ? "btn-primary px-3 py-1 text-xs"
              : "rounded-lg px-3 py-1 text-xs font-semibold text-navy"
          }
        >
          {r}d
        </Link>
      ))}
    </div>
  );
}
