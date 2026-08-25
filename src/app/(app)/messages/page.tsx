import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/Primitives";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { isEmailConfigured } from "@/lib/integrations/email";
import { isWhatsAppConfigured } from "@/lib/integrations/whatsapp";

export default async function MessagesPage() {
  await requireUser(["counselor", "admin"]);
  const supabase = createClient();
  const { data: recent } = await supabase
    .from("message_logs")
    .select("id, lead_id, channel, trigger_key, status, to_address, created_at, error")
    .order("created_at", { ascending: false })
    .limit(40);

  return (
    <div>
      <PageHeader
        eyebrow="WhatsApp + email"
        title="Outbound"
        accent="Messages"
        description="Stage-driven sends. Configure templates under Admin → Config → WA + Email triggers."
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div className="panel p-4 text-sm">
          <p className="font-semibold text-navy">WhatsApp</p>
          <p className="mt-1 text-muted">
            {isWhatsAppConfigured()
              ? "Provider configured (AiSensy or Meta Cloud)."
              : "Not configured — set AISENSY_API_KEY or META_WA_*."}
          </p>
        </div>
        <div className="panel p-4 text-sm">
          <p className="font-semibold text-navy">Email</p>
          <p className="mt-1 text-muted">
            {isEmailConfigured()
              ? "Resend configured."
              : "Not configured — set RESEND_API_KEY + EMAIL_FROM."}
          </p>
        </div>
      </div>
      <div className="panel overflow-hidden">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold text-navy">
          Recent sends
        </div>
        {!recent?.length ? (
          <p className="p-6 text-sm text-muted">
            No messages yet. Change a lead stage or apply the integration migration.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span
                  className={
                    m.status === "failed"
                      ? "font-semibold text-red-600"
                      : m.status === "sent"
                        ? "font-semibold text-emerald-700"
                        : "text-muted"
                  }
                >
                  {m.status}
                </span>
                <span className="text-navy">
                  {m.channel} · {m.trigger_key}
                </span>
                <span className="text-muted">{m.to_address}</span>
                <Link
                  href={`/leads/${m.lead_id}?tab=activity`}
                  className="ml-auto text-xs font-semibold text-periwinkle hover:underline"
                >
                  Lead →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="mt-4 text-xs text-muted">
        <Link href="/admin/config?tab=triggers" className="font-semibold text-periwinkle">
          Edit trigger map →
        </Link>
      </p>
    </div>
  );
}
