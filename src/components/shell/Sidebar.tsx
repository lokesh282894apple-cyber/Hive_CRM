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
  ChevronDown,
  Wallet,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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

type NavGroup = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
};

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

/** Admin sees everything — grouped and collapsible so the sidebar stays short. */
const adminGroups: NavGroup[] = [
  {
    id: "admissions",
    label: "Admissions",
    icon: BarChart3,
    items: [
      { href: "/admin/analytics", label: "Admission Analytics", icon: BarChart3 },
      { href: "/admin/monthly", label: "All months", icon: CalendarDays },
      { href: "/admin/leads", label: "All Leads", icon: ClipboardList },
      { href: "/leads", label: "Leads board", icon: ClipboardList },
      { href: "/attention", label: "Attention", icon: AlertTriangle },
      { href: "/admin/assign", label: "Bulk Assign", icon: UserPlus },
    ],
  },
  {
    id: "team",
    label: "Team",
    icon: Trophy,
    items: [
      { href: "/admin/counselor", label: "Counselor", icon: UserCircle2 },
      { href: "/admin/panel", label: "Panel", icon: GraduationCap },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    icon: Wallet,
    items: [
      { href: "/admin/payments", label: "Payments", icon: IndianRupee },
      {
        href: "/program/fees",
        label: "Fee & Loan",
        icon: IndianRupee,
        matchPaths: ["/program/fees", "/program/past-students"],
      },
    ],
  },
  { id: "marketing", label: "Marketing", icon: Megaphone, items: marketingNav },
  {
    id: "settings",
    label: "Settings",
    icon: Cog,
    items: [
      { href: "/admin/funnel", label: "Funnel Manager", icon: GitBranch },
      { href: "/admin/users", label: "Users & Roles", icon: Users },
      { href: "/admin/config", label: "System Config", icon: Cog },
      { href: "/admin/marketing/connections", label: "Ad Connections", icon: Link2 },
    ],
  },
];

const NAV_OPEN_KEY = "hive-nav-open-v1";

const interviewerNav: NavItem[] = [
  { href: "/interviewer/interviews", label: "Interviews", icon: GraduationCap },
  { href: "/interviewer/availability", label: "Availability", icon: Calendar },
];

const programNav: NavItem[] = [
  {
    href: "/program/fees",
    label: "Fee & Loan Tracker",
    icon: IndianRupee,
    matchPaths: ["/program/fees", "/program/past-students"],
  },
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
  if (role === "interviewer") return interviewerNav;
  if (role === "marketing") return marketingNav;
  if (role === "program") return programNav;
  return counselorNav;
}

function NavLink({
  item,
  href,
  active,
  compact,
}: {
  item: NavItem;
  href: string;
  active: boolean;
  compact?: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={href}
      prefetch={true}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition active:scale-[0.98]",
        compact ? "py-1.5" : "py-2.5",
        active ? "bg-gold/15 text-gold" : "text-white/75 hover:bg-white/5 hover:text-white"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function AdminNav({ pathname }: { pathname: string }) {
  const activeGroup =
    adminGroups.find((g) => g.items.some((i) => navItemActive(pathname, i)))?.id ?? null;
  // Server + first client render: only the current page's group open (no
  // hydration mismatch); then apply the user's remembered choices.
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    activeGroup ? { [activeGroup]: true } : { admissions: true }
  );
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(NAV_OPEN_KEY) || "null");
      if (saved && typeof saved === "object") setOpen((cur) => ({ ...saved, ...cur }));
    } catch {
      /* ignore */
    }
  }, []);
  // Navigating into a collapsed group opens it
  useEffect(() => {
    if (activeGroup) setOpen((cur) => (cur[activeGroup] ? cur : { ...cur, [activeGroup]: true }));
  }, [activeGroup]);

  function toggle(id: string) {
    setOpen((cur) => {
      const next = { ...cur, [id]: !cur[id] };
      try {
        window.localStorage.setItem(NAV_OPEN_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <div className="space-y-1">
      {adminGroups.map((g) => {
        const isOpen = Boolean(open[g.id]);
        const hasActive = g.id === activeGroup;
        const GroupIcon = g.icon;
        return (
          <div key={g.id}>
            <button
              type="button"
              onClick={() => toggle(g.id)}
              aria-expanded={isOpen}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-eyebrow transition",
                hasActive && !isOpen ? "text-gold" : "text-white/50 hover:text-white/80"
              )}
            >
              <GroupIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">{g.label}</span>
              {!isOpen ? (
                <span className="rounded-full bg-white/10 px-1.5 text-[10px] font-medium normal-case tracking-normal text-white/60">
                  {g.items.length}
                </span>
              ) : null}
              <ChevronDown
                className={cn("h-3.5 w-3.5 shrink-0 transition-transform", isOpen ? "" : "-rotate-90")}
              />
            </button>
            {isOpen ? (
              <div className="mb-2 ml-2 space-y-0.5 border-l border-white/10 pl-2">
                {g.items.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    href={item.href}
                    active={navItemActive(pathname, item)}
                    compact
                  />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
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
  const effectivePath = targetUserId
    ? pathname.replace(new RegExp(`^/view/${targetUserId}`), "") || "/"
    : pathname;
  // Admins get grouped navigation; every other role (and View as) a short flat list
  const grouped = role === "admin" && !targetUserId;
  const items = grouped ? [] : navForRole(role);

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
        {grouped ? (
          <AdminNav pathname={effectivePath} />
        ) : (
          items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              href={withViewAs(item.href)}
              active={navItemActive(effectivePath, item)}
            />
          ))
        )}
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
