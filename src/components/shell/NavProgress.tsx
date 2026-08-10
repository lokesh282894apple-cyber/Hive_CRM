"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function NavProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
    const done = window.setTimeout(() => setVisible(false), 400);
    return () => window.clearTimeout(done);
  }, [pathname, searchParams]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden"
      aria-hidden
    >
      <div className="h-full w-full origin-left animate-pulse bg-periwinkle/80" />
    </div>
  );
}

export function NavProgress() {
  return (
    <Suspense fallback={null}>
      <NavProgressInner />
    </Suspense>
  );
}
