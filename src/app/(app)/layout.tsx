import { requireUser } from "@/lib/auth";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { NavProgress } from "@/components/shell/NavProgress";
import { AiChatWidget } from "@/components/shell/AiChatWidget";
import { FunnelProvider } from "@/components/funnel/FunnelProvider";
import { getFunnelConfig } from "@/lib/funnel/config";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const showAi = user.role === "admin" || user.role === "marketing";
  const funnel =
    user.role === "admin" || user.role === "counselor"
      ? await getFunnelConfig()
      : null;

  const body = (
    <div className="flex h-dvh overflow-hidden bg-[#F7F8FC]">
      <NavProgress />
      <Sidebar role={user.role} userName={user.name} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-h-0 flex-1 overflow-y-auto px-6 py-6">{children}</main>
      </div>
      <AiChatWidget enabled={showAi} />
    </div>
  );

  if (!funnel) return body;
  return <FunnelProvider value={funnel}>{body}</FunnelProvider>;
}
