import { requireAuth } from "@/lib/auth";
import { Sidebar } from "@/components/shell/Sidebar";
import { SIDEBAR_COLLAPSED_COOKIE } from "@/lib/ui-prefs";
import { cookies } from "next/headers";
import { TopBar } from "@/components/shell/TopBar";
import { NavProgress } from "@/components/shell/NavProgress";
import { Toaster } from "@/components/ui/Toaster";
import { AiChatWidget } from "@/components/shell/AiChatWidget";
import { FunnelProvider } from "@/components/funnel/FunnelProvider";
import { ImpersonationProvider } from "@/components/shell/ImpersonationProvider";
import { ImpersonationBanner } from "@/components/shell/ImpersonationBanner";
import { SessionGuard } from "@/components/shell/SessionGuard";
import { ForcePasswordChange } from "@/components/shell/ForcePasswordChange";
import { getFunnelCatalog } from "@/lib/funnel/config";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAuth();
  const { user, actor, impersonating } = ctx;

  // Loaded with the cached session profile — no extra query per navigation
  const mustChange = !impersonating && Boolean(actor.must_change_password);

  const showAi =
    !impersonating && (user.role === "admin" || user.role === "marketing");
  const funnel =
    user.role === "admin" || user.role === "counselor"
      ? await getFunnelCatalog()
      : null;

  const body = (
    <ImpersonationProvider
      targetUserId={impersonating ? user.id : null}
      targetName={impersonating ? user.name : null}
      actorName={impersonating ? actor.name : null}
    >
      <div className="flex h-dvh overflow-hidden bg-[#F7F8FC]">
        <SessionGuard userId={actor.id} />
        {mustChange ? <ForcePasswordChange role={actor.role} /> : null}
        <NavProgress />
        <Sidebar
          role={user.role}
          userName={user.name}
          initialCollapsed={cookies().get(SIDEBAR_COLLAPSED_COOKIE)?.value === "1"}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <TopBar actorLabel={impersonating ? actor.name : null} />
          <ImpersonationBanner />
          <main className="min-h-0 flex-1 overflow-y-auto px-6 py-6">{children}</main>
        </div>
        <AiChatWidget enabled={showAi} />
        <Toaster />
      </div>
    </ImpersonationProvider>
  );

  if (!funnel) return body;
  return <FunnelProvider value={funnel}>{body}</FunnelProvider>;
}
