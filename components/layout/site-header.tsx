import Link from "next/link";

import { Button } from "@/components/ui/button";

import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { navItems as defaultNavItems, type NavItem } from "./nav-items";

export function SiteHeader({ items = defaultNavItems }: { items?: NavItem[] }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/70">
      <div className="container-site flex h-(--header-height) items-center gap-4">
        <Logo />
        <nav aria-label="주 메뉴" className="hidden flex-1 items-center gap-1 md:flex">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              {...(item.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              {item.title}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          {/* P1에서 /login 연결 및 로그인 상태 표시 */}
          <Button variant="outline" size="sm" disabled>
            로그인
          </Button>
          <MobileNav items={items} />
        </div>
      </div>
    </header>
  );
}
