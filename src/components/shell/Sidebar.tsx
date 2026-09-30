"use client";

import { cn } from "@/lib/utils";
import type { Role } from "@/lib/constants";
import { useImpersonation } from "@/components/shell/ImpersonationProvider";
import {
  BarChart3,
  Calendar,
  CalendarDays,
  ClipboardList,
  Cog,
  GitBranch,
  IndianRupee,
  LayoutDashboard,
  Link2,
  Megaphone,
  MessageSquare,
  Settings2,
  TrendingUp,
  Users,
  UserCircle2,
  AlertTriangle,
  GraduationCap,
  LineChart,
  Upload,
  Share2,
  Globe,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Highlight when pathname matches any of these (for grouped sections). */
  matchPaths?: string[];
};

const counselorNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads", label: "My Leads", icon: ClipboardList },
  { href: "/leads/tasks", label: "My Tasks", icon: CalendarDays },
  { href: "/leads/new", label: "Add Lead", icon: UserCircle2 },
  { href: "/attention", label: "Attention", icon: AlertTriangle },
  { href: "/messages", label: "WA Messaging", icon: MessageSquare },
];

const adminNav: NavItem[] = [
  { href: "/admin/analytics", label: "Admission Analytics", icon: BarChart3 },
  { href: "/admin/monthly", label: "All months", icon: CalendarDays },
  { href: "/admin/leads", label: "All Leads", icon: ClipboardList },
  { href: "/admin/assign", label: "Bulk Assign", icon: UserPlus },
  { href: "/admin/funnel", label: "Funnel Manager", icon: GitBranch },
  { href: "/admin/panel", label: "Panel", icon: GraduationCap },
  { href: "/admin/counselor", label: "Counselor", icon: UserCircle2 },
  { href: "/admin/payments", label: "Payments", icon: IndianRupee },
  { href: "/program/fees", label: "Fee & Loan", icon: IndianRupee },
  { href: "/admin/users", label: "Users & Roles", icon: Users },
  { href: "/admin/config", label: "System Config", icon: Cog },
  { href: "/admin/marketing/connections", label: "Ad Connections", icon: Link2 },
];

const marketingNav: NavItem[] = [
  { href: "/marketing/dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    href: "/marketing/funnel",
    label: "Leads",
    icon: TrendingUp,
    matchPaths: [
      "/marketing/funnel",
      "/marketing/qualification",
      "/marketing/calls",
      "/marketing/attribution",
      "/marketing/roi",
    ],
  },
  {
    href: "/marketing/ads",
    label: "Performance",
    icon: Megaphone,
    matchPaths: ["/marketing/ads", "/marketing/performance"],
  },
  {
    href: "/marketing/pnl",
    label: "P&L",
    icon: LineChart,
    matchPaths: ["/marketing/pnl", "/marketing/monthly"],
  },
  {
    href: "/marketing/forecast",
    label: "Planning",
    icon: CalendarDays,
    matchPaths: [
      "/marketing/forecast",
      "/marketing/calendar",
      "/marketing/tasks",
    ],
  },
  { href: "/marketing/social", label: "Socials", icon: Share2 },
  {
    href: "/marketing/sessions",
    label: "Website",
    icon: Globe,
    matchPaths: [
      "/marketing/sessions",
      "/marketing/pages",
      "/marketing/website-leads",
      "/marketing/conversions",
      "/marketing/heatmaps",
    ],
  },
  {
    href: "/marketing/imports",
    label: "Data",
    icon: Upload,
    matchPaths: ["/marketing/imports", "/marketing/campaigns"],
  },
];

const interviewerNav: NavItem[] = [
  { href: "/interviewer/interviews", label: "Interviews", icon: GraduationCap },
  { href: "/interviewer/availability", label: "Availability", icon: Calendar },
];

const programNav: NavItem[] = [
  { href: "/program/fees", label: "Fee & Loan Tracker", icon: IndianRupee },
];

function navItemActive(pathname: string, item: NavItem): boolean {
  if (item.href === "/leads") {
    return (
      pathname === "/leads" ||
      /^\/leads\/[0-9a-f-]{36}/i.test(pathname)
    );
  }
  if (item.matchPaths?.length) {
    return item.matchPaths.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`)
    );
  }
  return (
    pathname === item.href ||
    (item.href !== "/dashboard" &&
      item.href !== "/admin/dashboard" &&
      item.href !== "/admin/analytics" &&
      item.href !== "/marketing/dashboard" &&
      pathname.startsWith(item.href))
  );
}

function navForRole(role: Role): NavItem[] {
  if (role === "admin") return adminNav;
  if (role === "interviewer") return interviewerNav;
  if (role === "marketing") return marketingNav;
  if (role === "program") return programNav;
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
  const { href: withViewAs, targetUserId } = useImpersonation();
  const items = navForRole(role);
  const effectivePath = targetUserId
    ? pathname.replace(new RegExp(`^/view/${targetUserId}`), "") || "/"
    : pathname;

  return (
    <aside className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col bg-navy text-white">
      <div className="border-b border-white/10 px-5 py-5">
        <p className="text-[11px] font-semibold uppercase tracking-eyebrow text-periwinkle">
          HiveSchool
        </p>
        <p className="mt-1 text-lg font-semibold tracking-tight">
          {role === "marketing"
            ? "Marketing"
            : role === "program"
              ? "Program"
              : targetUserId
                ? "View as"
                : "Admissions"}
        </p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {items.map((item) => {
          const active = navItemActive(effectivePath, item);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={withViewAs(item.href)}
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
        {role === "admin" && !targetUserId ? (
          <>
            <div className="pt-4">
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-eyebrow text-white/40">
                Marketing
              </p>
              {marketingNav.map((item) => {
                const Icon = item.icon;
                const active = navItemActive(pathname, item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={true}
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
                .filter(
                  (i) =>
                    i.href === "/leads" ||
                    i.href === "/attention"
                )
                .map((item) => {
                  const Icon = item.icon;
                  const active = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={true}
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
