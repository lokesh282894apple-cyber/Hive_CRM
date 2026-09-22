import { Suspense } from "react";
import LoginPage from "./LoginClient";

export default function LoginRoute() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-navy text-sm text-white/70">
          Loading…
        </div>
      }
    >
      <LoginPage />
    </Suspense>
  );
}
