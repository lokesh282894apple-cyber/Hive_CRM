import type { OfferMetrics, RoundMetrics } from "@/lib/analytics/admissions-funnel";
import { FunnelMatrix, OfferFunnelMatrix } from "./FunnelMatrix";

function MiniTotals({
  total,
  organic,
  inorganic,
}: {
  total: number;
  organic: number;
  inorganic: number;
}) {
  return (
    <p className="mb-3 text-xs text-muted">
      <span className="font-semibold text-navy">{total}</span> leads ·{" "}
      <span className="text-navy">{organic}</span> organic ·{" "}
      <span className="text-navy">{inorganic}</span> inorganic
    </p>
  );
}

export function AttributionSplit({
  organic,
  inorganic,
  courseId,
  cohortId,
  counselorId,
}: {
  organic: {
    leadTotals: { total: number; organic: number; inorganic: number };
    roundFunnel: { R1: RoundMetrics; R2: RoundMetrics; R3: RoundMetrics };
    offerFunnel: OfferMetrics;
  };
  inorganic: {
    leadTotals: { total: number; organic: number; inorganic: number };
    roundFunnel: { R1: RoundMetrics; R2: RoundMetrics; R3: RoundMetrics };
    offerFunnel: OfferMetrics;
  };
  courseId?: string | null;
  cohortId?: string | null;
  counselorId?: string | null;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h3 className="mb-1 text-sm font-semibold text-navy">Organic</h3>
        <MiniTotals {...organic.leadTotals} />
        <div className="space-y-3">
          <FunnelMatrix
            round="R1"
            metrics={organic.roundFunnel.R1}
            courseId={courseId}
            cohortId={cohortId}
            counselorId={counselorId}
          />
          <OfferFunnelMatrix
            offered={organic.offerFunnel.offered}
            won={organic.offerFunnel.won}
            lost={organic.offerFunnel.lost}
            wonRate={organic.offerFunnel.rates.won}
            lostRate={organic.offerFunnel.rates.lost}
            courseId={courseId}
            cohortId={cohortId}
            counselorId={counselorId}
          />
        </div>
      </div>
      <div>
        <h3 className="mb-1 text-sm font-semibold text-navy">Inorganic</h3>
        <MiniTotals {...inorganic.leadTotals} />
        <div className="space-y-3">
          <FunnelMatrix
            round="R1"
            metrics={inorganic.roundFunnel.R1}
            courseId={courseId}
            cohortId={cohortId}
            counselorId={counselorId}
          />
          <OfferFunnelMatrix
            offered={inorganic.offerFunnel.offered}
            won={inorganic.offerFunnel.won}
            lost={inorganic.offerFunnel.lost}
            wonRate={inorganic.offerFunnel.rates.won}
            lostRate={inorganic.offerFunnel.rates.lost}
            courseId={courseId}
            cohortId={cohortId}
            counselorId={counselorId}
          />
        </div>
      </div>
    </div>
  );
}
