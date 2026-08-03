import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/Primitives";

export default async function MessagesPage() {
  await requireUser(["counselor", "admin"]);

  return (
    <div>
      <PageHeader
        eyebrow="WhatsApp messaging"
        title="WA"
        accent="Messaging"
        description="Placeholder only — no send/receive integration in this build."
      />
      <div className="panel max-w-2xl p-8">
        <p className="eyebrow">Out of scope</p>
        <h2 className="mt-2 text-xl font-semibold text-navy">
          Integration deferred
        </h2>
        <p className="mt-2 text-sm text-muted">
          Platform choice (WhatsApp Business API / Interakt / AiSensy) will be decided when the
          Marketing funnel is scoped. This screen exists so navigation matches the wireframe IA.
        </p>
      </div>
    </div>
  );
}
