import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import type { HeaderViewer } from "@/components/layout/viewer";
import { getCurrentUser } from "@/lib/auth/current-user";
import { toUserRole } from "@/lib/auth/roles";
import { isSignupExemptPath } from "@/lib/auth/signup-gate";
import { PATHNAME_HEADER } from "@/lib/supabase/middleware";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  // 로그인했지만 가입 정보를 입력하지 않았으면 /signup으로 보낸다.
  if (user && !user.profile) {
    const pathname = (await headers()).get(PATHNAME_HEADER) ?? "/";
    if (!isSignupExemptPath(pathname)) redirect("/signup");
  }

  const viewer: HeaderViewer | null = user
    ? {
        nickname: user.profile?.nickname ?? null,
        role: user.profile ? toUserRole(user.profile.role) : null,
        pendingGuardian: user.profile?.status === "pending_guardian",
      }
    : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:font-medium focus:shadow-md focus:ring-2 focus:ring-ring"
      >
        본문 바로가기
      </a>
      <SiteHeader viewer={viewer} />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
