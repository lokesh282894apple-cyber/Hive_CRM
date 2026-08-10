"use client";

import { cn } from "@/lib/utils";
import type { Role } from "@/lib/constants";
import {
  BarChart3,
  Calendar,
  ClipboardList,
  Cog,
  Flame,
  FileText,
  LayoutDashboard,
  Link2,
  Megaphone,
  MessageSquare,
  Settings2,
  Users,
  UserCircle2,
  AlertTriangle,
  GraduationCap,
  Activity,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const counselorNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads", label: "My Leads", icon: ClipboardList },
  { href: "/leads/new", label: "Add Lead", icon: UserCircle2 },
  { href: "/attention", label: "Attention", icon: AlertTriangle },
  { href: "/messages", label: "WA Messaging", icon: MessageSquare },
];

const adminNav: NavItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/leads", label: "All Leads", icon: ClipboardList },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/users", label: "Users & Roles", icon: Users },
  { href: "/admin/config", label: "System Config", icon: Cog },
  { href: "/admin/marketing/connections", label: "Ad Connections", icon: Link2 },
];

const marketingNav: NavItem[] = [
  { href: "/marketing/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/marketing/performance", label: "Performance", icon: BarChart3 },
  { href: "/marketing/sessions", label: "Sessions", icon: Activity },
  { href: "/marketing/pages", label: "Pages", icon: FileText },
  { href: "/marketing/conversions", label: "Conversions", icon: UserCheck },
  { href: "/marketing/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/marketing/heatmaps", label: "Heatmaps", icon: Flame },
];

const interviewerNav: NavItem[] = [
  { href: "/interviewer/interviews", label: "Interviews", icon: GraduationCap },
  { href: "/interviewer/availability", label: "Availability", icon: Calendar },
];

function navForRole(role: Role): NavItem[] {
  if (role === "admin") return adminNav;
  if (role === "interviewer") return interviewerNav;
  if (role === "marketing") return marketingNav;
  return counselorNav;
}

export function Sidebar({
  role,
  userName,
}: {
  role: Role;
  userName: string;
}) {
  const pathname = usePathname();
  const items = navForRole(role);

  return (
    <aside className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col bg-navy text-white">
      <div className="border-b border-white/10 px-5 py-5">
        <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-periwinkle">
          HiveSchool
        </p>
        <p className="mt-1 text-lg font-semibold tracking-tight">
          {role === "marketing" ? "Marketing" : "Admissions"}
        </p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {items.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" &&
              item.href !== "/admin/dashboard" &&
              item.href !== "/marketing/dashboard" &&
              pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition active:scale-[0.98]",
                active
                  ? "bg-gold/15 text-gold"
                  : "text-white/75 hover:bg-white/5 hover:text-white"
              )}
              prefetch={true}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
        {role === "admin" ? (
          <>
            <div className="pt-4">
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-eyebrow text-white/40">
                Marketing
              </p>
              {marketingNav.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                      active
                        ? "bg-periwinkle/20 text-periwinkle"
                        : "text-white/75 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
            <div className="pt-4">
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-eyebrow text-white/40">
                Counselor views
              </p>
              {counselorNav
                .filter((i) => i.href === "/leads" || i.href === "/attention")
                .map((item) => {
                  const Icon = item.icon;
                  const active = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                        active
                          ? "bg-periwinkle/20 text-periwinkle"
                          : "text-white/75 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
            </div>
          </>
        ) : null}
      </nav>

      <div className="border-t border-white/10 px-4 py-4">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-periwinkle" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{userName}</p>
            <p className="text-[11px] uppercase tracking-eyebrow text-white/50">{role}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
