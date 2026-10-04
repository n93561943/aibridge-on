import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { GuardianPendingBanner } from "@/components/layout/guardian-pending-banner";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SuspendedBanner } from "@/components/layout/suspended-banner";
import type { HeaderViewer } from "@/components/layout/viewer";
import { countPendingTeachers } from "@/lib/admin/users";
import { getCurrentUser } from "@/lib/auth/current-user";
import { toUserRole } from "@/lib/auth/roles";
import { isSignupExemptPath } from "@/lib/auth/signup-gate";
import { getNavItems } from "@/lib/menus/queries";
import { PATHNAME_HEADER } from "@/lib/supabase/middleware";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [user, navItems] = await Promise.all([getCurrentUser(), getNavItems()]);

  // 로그인했지만 가입 정보를 입력하지 않았으면 /signup으로 보낸다.
  if (user && !user.profile) {
    const pathname = (await headers()).get(PATHNAME_HEADER) ?? "/";
    if (!isSignupExemptPath(pathname)) redirect("/signup");
  }

  const role = user?.profile ? toUserRole(user.profile.role) : null;
  const isActiveAdmin = role === "admin" && user?.profile?.status === "active";
  const viewer: HeaderViewer | null = user
    ? {
        nickname: user.profile?.nickname ?? null,
        role,
        pendingGuardian: user.profile?.status === "pending_guardian",
        suspended: user.profile?.status === "suspended",
        // 관리자에게만 교사 승인 대기 수를 보여 준다(RLS: 관리자 전체 프로필 조회).
        pendingTeachers: isActiveAdmin ? await countPendingTeachers() : undefined,
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
      <SiteHeader items={navItems} viewer={viewer} />
      {viewer?.pendingGuardian && <GuardianPendingBanner />}
      {viewer?.suspended && <SuspendedBanner />}
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
