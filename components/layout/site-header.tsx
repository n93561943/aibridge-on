import Link from "next/link";

import { Button } from "@/components/ui/button";

import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { navItems as defaultNavItems, type NavItem } from "./nav-items";
import { UserMenu } from "./user-menu";
import type { HeaderViewer } from "./viewer";

export function SiteHeader({
  items = defaultNavItems,
  viewer = null,
}: {
  items?: NavItem[];
  viewer?: HeaderViewer | null;
}) {
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
          {viewer ? (
            <UserMenu viewer={viewer} />
          ) : (
            <Button asChild variant="outline" size="sm" className="h-9">
              <Link href="/login">로그인</Link>
            </Button>
          )}
          <MobileNav items={items} viewer={viewer} />
        </div>
      </div>
    </header>
  );
}
