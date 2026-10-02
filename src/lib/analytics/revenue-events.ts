/**
 * Revenue dated by when it happened — one definition used by the Marketing
 * P&L and the All-months table.
 *  - Booked   = fee (excl. GST) of students who first reached closed_paid in
 *               the month; GST returned separately.
 *  - Realised = money that hit the bank in the month.
 * Past-student entries (back-dated, manual) are excluded from both.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages, mapInChunks } from "@/lib/supabase/paginate";
import { PAST_STUDENT_SOURCE } from "@/lib/analytics/funnel-engine";
import { istDateKey, istEndIso, istStartIso } from "@/lib/tz";

type FeeRow = {
  id: string;
  lead_id: string;
  total_fee: number | null;
  gross_fee_with_gst: number | null;
  net_fee_without_gst: number | null;
};

/** Fee excluding GST and the GST part, from what the program team entered. */
export function feeExGst(f: FeeRow): { exGst: number; gst: number } {
  const total = Number(f.total_fee) || 0;
  const net = f.net_fee_without_gst != null ? Number(f.net_fee_without_gst) || 0 : null;
  const gross = f.gross_fee_with_gst != null ? Number(f.gross_fee_with_gst) || 0 : null;
  const exGst = net ?? total;
  const gst = gross != null && net != null && gross > net ? gross - net : 0;
  return { exGst, gst };
}

/**
 * Money that hit the bank per IST month: instalment lines by date hit bank
 * (else paid date), amount hit bank (else amount realised). Loans count when
 * marked realised, dated by their last update (the only date stored).
 */
export async function realisedRevenueByMonth(
  admin: SupabaseClient,
  fromDate: string,
  toDate: string
): Promise<Map<string, number>> {
  const inRange = (day: string | null) => !!day && day >= fromDate && day <= toDate;
  const [byBankDate, byPaidAt, loans] = await Promise.all([
    fetchAllPages<{ id: string; fee_record_id: string; amount_hit_bank: number | null; amount_realised: number | null; date_hit_bank: string | null }>(
      (from, to) =>
        admin
          .from("installments")
          .select("id, fee_record_id, amount_hit_bank, amount_realised, date_hit_bank")
          .gte("date_hit_bank", fromDate)
          .lte("date_hit_bank", toDate)
          .order("id", { ascending: true })
          .range(from, to),
      "pnl.installments.bank"
    ),
    fetchAllPages<{ id: string; fee_record_id: string; amount_realised: number | null; paid_at: string | null; date_hit_bank: string | null }>(
      (from, to) =>
        admin
          .from("installments")
          .select("id, fee_record_id, amount_realised, paid_at, date_hit_bank")
          .is("date_hit_bank", null)
          .gte("paid_at", istStartIso(fromDate))
          .lte("paid_at", istEndIso(toDate))
          .order("id", { ascending: true })
          .range(from, to),
      "pnl.installments.paid"
    ),
    fetchAllPages<{ fee_record_id: string; amount_realised: number | null; updated_at: string }>(
      (from, to) =>
        admin
          .from("loans")
          .select("fee_record_id, amount_realised, updated_at")
          .gt("amount_realised", 0)
          .gte("updated_at", istStartIso(fromDate))
          .lte("updated_at", istEndIso(toDate))
          .order("fee_record_id", { ascending: true })
          .range(from, to),
      "pnl.loans"
    ),
  ]);

  const events: { feeId: string; day: string; amount: number }[] = [];
  for (const i of byBankDate) {
    const amt = Number(i.amount_hit_bank) || Number(i.amount_realised) || 0;
    if (amt > 0 && inRange(i.date_hit_bank)) events.push({ feeId: i.fee_record_id, day: i.date_hit_bank!, amount: amt });
  }
  for (const i of byPaidAt) {
    const amt = Number(i.amount_realised) || 0;
    const day = i.paid_at ? istDateKey(i.paid_at) : null;
    if (amt > 0 && inRange(day)) events.push({ feeId: i.fee_record_id, day: day!, amount: amt });
  }
  for (const l of loans) {
    const amt = Number(l.amount_realised) || 0;
    const day = istDateKey(l.updated_at);
    if (amt > 0 && inRange(day)) events.push({ feeId: l.fee_record_id, day, amount: amt });
  }

  // Past students are back-dated manual entries, not marketing revenue
  const feeIds = Array.from(new Set(events.map((e) => e.feeId)));
  const fees = await mapInChunks(feeIds, async (chunk) => {
    const { data } = await admin.from("fee_records").select("id, lead_id").in("id", chunk);
    return (data ?? []) as { id: string; lead_id: string }[];
  });
  const leadIds = Array.from(new Set(fees.map((f) => f.lead_id)));
  const leads = await mapInChunks(leadIds, async (chunk) => {
    const { data } = await admin.from("leads").select("id, source").in("id", chunk);
    return (data ?? []) as { id: string; source: string | null }[];
  });
  const pastStudentLeads = new Set(leads.filter((l) => l.source === PAST_STUDENT_SOURCE).map((l) => l.id));
  const leadByFee = new Map(fees.map((f) => [f.id, f.lead_id]));

  const out = new Map<string, number>();
  for (const e of events) {
    const lead = leadByFee.get(e.feeId);
    if (lead && pastStudentLeads.has(lead)) continue;
    const mk = e.day.slice(0, 7);
    out.set(mk, (out.get(mk) ?? 0) + e.amount);
  }
  return out;
}

/** Booked revenue (excl. GST) and GST per month, by the month the student converted. */
export async function bookedRevenueByConvertMonth(
  admin: SupabaseClient,
  fromIso: string,
  toIso: string
): Promise<Map<string, { exGst: number; gst: number; converts: number }>> {
  const paidInRange = await fetchAllPages<{ lead_id: string }>(
    (from, to) =>
      admin
        .from("stage_history")
        .select("lead_id")
        .eq("to_stage", "closed_paid")
        .gte("changed_at", fromIso)
        .lte("changed_at", toIso)
        .order("id", { ascending: true })
        .range(from, to),
    "pnl.converts"
  );
  const ids = Array.from(new Set(paidInRange.map((r) => r.lead_id)));
  const [firstPaid, leads, fees] = await Promise.all([
    mapInChunks(ids, async (chunk) => {
      const { data } = await admin
        .from("stage_history")
        .select("lead_id, changed_at")
        .eq("to_stage", "closed_paid")
        .in("lead_id", chunk);
      return (data ?? []) as { lead_id: string; changed_at: string }[];
    }),
    mapInChunks(ids, async (chunk) => {
      const { data } = await admin.from("leads").select("id, source").in("id", chunk);
      return (data ?? []) as { id: string; source: string | null }[];
    }),
    mapInChunks(ids, async (chunk) => {
      const { data } = await admin
        .from("fee_records")
        .select("id, lead_id, total_fee, gross_fee_with_gst, net_fee_without_gst")
        .in("lead_id", chunk);
      return (data ?? []) as FeeRow[];
    }),
  ]);
  const first = new Map<string, string>();
  for (const r of firstPaid) {
    const iso = new Date(r.changed_at).toISOString();
    const cur = first.get(r.lead_id);
    if (!cur || iso < cur) first.set(r.lead_id, iso);
  }
  const past = new Set(leads.filter((l) => l.source === PAST_STUDENT_SOURCE).map((l) => l.id));
  const feeByLead = new Map(fees.map((f) => [f.lead_id, f]));
  const out = new Map<string, { exGst: number; gst: number; converts: number }>();
  const from = new Date(fromIso).toISOString();
  const to = new Date(toIso).toISOString();
  for (const [leadId, at] of Array.from(first.entries())) {
    if (past.has(leadId) || at < from || at > to) continue;
    const mk = istDateKey(at).slice(0, 7);
    const cur = out.get(mk) ?? { exGst: 0, gst: 0, converts: 0 };
    cur.converts += 1;
    const fee = feeByLead.get(leadId);
    if (fee) {
      const { exGst, gst } = feeExGst(fee);
      cur.exGst += exGst;
      cur.gst += gst;
    }
    out.set(mk, cur);
  }
  return out;
}

