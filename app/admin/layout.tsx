import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/layout/logo";
import { requireAdmin } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: { default: "관리자", template: "%s | 관리자" },
  robots: { index: false, follow: false },
};

const adminNav = [{ title: "메뉴 관리", href: "/admin/menus" }];

/** 관리자 화면 공통 틀. 대시보드(P6) 전까지는 메뉴 관리만 있다. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin("/admin");

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="container-site flex h-(--header-height) items-center gap-3">
          <Logo />
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
            관리자
          </span>
          <nav aria-label="관리자 메뉴" className="flex items-center gap-1">
            {adminNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-2 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                {item.title}
              </Link>
            ))}
          </nav>
          <Link
            href="/"
            className="ml-auto shrink-0 rounded-md px-2 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            사이트로
          </Link>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
    </div>
  );
}
