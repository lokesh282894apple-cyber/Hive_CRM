import type { ConversionPercents } from "@/lib/analytics/admissions-funnel";

function fmtPct(n: number | null) {
  if (n == null) return "—";
  return `${n.toFixed(1)}%`;
}

const ROWS: { key: keyof ConversionPercents; label: string }[] = [
  { key: "r1BookedToOffered", label: "R1 Booked :: Offered" },
  { key: "r2BookedToOffered", label: "R2 Booked :: Offered" },
  { key: "r3BookedToOffered", label: "R3 Booked :: Offered" },
  { key: "r1BookedToConverts", label: "R1 Booked :: Converts" },
  { key: "r2BookedToConverts", label: "R2 Booked :: Converts" },
  { key: "r3BookedToConverts", label: "R3 Booked :: Converts" },
  { key: "offeredToConverts", label: "Offered :: Converts" },
  { key: "leadsToConverts", label: "Leads :: Converts" },
];

export function ConversionTable({ data }: { data: ConversionPercents }) {
  return (
    <div className="-mx-5 -mb-5 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-navy/[0.02]">
          <tr>
            <th className="eyebrow px-5 py-2.5">Conversion</th>
            <th className="eyebrow px-5 py-2.5 text-right">Rate</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.key} className="border-b border-border last:border-0">
              <td className="px-5 py-2.5 font-medium text-navy">{r.label}</td>
              <td className="px-5 py-2.5 text-right tabular-nums text-muted">
                {fmtPct(data[r.key])}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
