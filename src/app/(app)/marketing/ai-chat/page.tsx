import { getAiChatBudget } from "@/app/actions/ai-chat";
import { AiChatClient } from "@/components/admin/AiChatClient";
import { PageHeader } from "@/components/ui/Primitives";
import { requireUser } from "@/lib/auth";

export default async function MarketingAiChatPage() {
  await requireUser(["admin", "marketing"]);
  const budget = await getAiChatBudget();

  return (
    <div>
      <PageHeader
        eyebrow="Marketing · AI"
        title="AI"
        accent="Chat"
        description="Ask questions against marketing and admissions KPI counts. Hard monthly USD cap from app settings."
      />
      <AiChatClient initialBudget={budget} />
    </div>
  );
}
