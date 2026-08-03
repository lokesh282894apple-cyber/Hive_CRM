import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/Primitives";
import { FeesClient } from "@/components/leads/FeesClient";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function FeesPage({ params }: { params: { id: string } }) {
  await requireUser(["counselor", "admin"]);
  const supabase = createClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("id, name, cohort_id, cohorts(default_total_fee)")
    .eq("id", params.id)
    .maybeSingle();
  if (!lead) notFound();

  const { data: feeRecord } = await supabase
    .from("fee_records")
    .select("*")
    .eq("lead_id", params.id)
    .maybeSingle();

  const [{ data: installments }, { data: loan }, { data: vendors }, { data: settings }] =
    await Promise.all([
      feeRecord
        ? supabase
            .from("installments")
            .select("*")
            .eq("fee_record_id", feeRecord.id)
            .order("installment_number")
        : Promise.resolve({ data: [] }),
      feeRecord
        ? supabase.from("loans").select("*").eq("fee_record_id", feeRecord.id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("loan_vendors").select("*").eq("active", true).order("name"),
      supabase.from("app_settings").select("*").eq("key", "default_installment_count").maybeSingle(),
    ]);

  const cohort = lead.cohorts as unknown as { default_total_fee: number } | null;

  return (
    <div>
      <PageHeader
        eyebrow="Fees & collection"
        title={lead.name}
        accent="Fees"
        description="Direct installments or loan pipeline. Totals default from cohort and are admin-overridable."
        actions={
          <Link href={`/leads/${params.id}`} className="btn-secondary">
            Back to lead
          </Link>
        }
      />
      <FeesClient
        leadId={params.id}
        feeRecord={feeRecord}
        installments={installments ?? []}
        loan={loan}
        vendors={vendors ?? []}
        defaultTotalFee={Number(cohort?.default_total_fee ?? 0)}
        defaultCount={Number(settings?.value ?? 3)}
      />
    </div>
  );
}
