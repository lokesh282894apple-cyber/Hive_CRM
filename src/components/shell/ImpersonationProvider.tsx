"use client";

import { viewAsHref } from "@/lib/impersonation";
import Link from "next/link";
import {
  createContext,
  useContext,
  type ComponentProps,
  type ReactNode,
} from "react";

type ImpersonationCtx = {
  targetUserId: string | null;
  targetName: string | null;
  actorName: string | null;
  href: (path: string) => string;
};

const Ctx = createContext<ImpersonationCtx>({
  targetUserId: null,
  targetName: null,
  actorName: null,
  href: (path) => path,
});

export function ImpersonationProvider({
  targetUserId,
  targetName,
  actorName,
  children,
}: {
  targetUserId: string | null;
  targetName?: string | null;
  actorName?: string | null;
  children: ReactNode;
}) {
  const value: ImpersonationCtx = {
    targetUserId,
    targetName: targetName ?? null,
    actorName: actorName ?? null,
    href: (path) => viewAsHref(targetUserId, path),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useImpersonation() {
  return useContext(Ctx);
}

/** Link that stays inside /view/[userId]/… while impersonating. */
export function AppLink({ href, ...rest }: ComponentProps<typeof Link>) {
  const { href: prefix } = useImpersonation();
  const next =
    typeof href === "string" ? prefix(href) : href;
  return <Link href={next} {...rest} />;
}
