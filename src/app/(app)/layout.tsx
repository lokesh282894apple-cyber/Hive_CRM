import { requireUser } from "@/lib/auth";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { NavProgress } from "@/components/shell/NavProgress";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex h-dvh overflow-hidden bg-[#F7F8FC]">
      <NavProgress />
      <Sidebar role={user.role} userName={user.name} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-h-0 flex-1 overflow-y-auto px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
