import { SearchIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { NavGroupMenu } from "./nav-group-menu";
import type { NavItem } from "./nav-items";
import { UserMenu } from "./user-menu";
import type { HeaderViewer } from "./viewer";

export function SiteHeader({
  items = [],
  viewer = null,
}: {
  items?: NavItem[];
  viewer?: HeaderViewer | null;
}) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/70 print:hidden">
      <div className="container-site flex h-(--header-height) items-center gap-4">
        <Logo />
        <nav aria-label="주 메뉴" className="hidden flex-1 items-center gap-1 md:flex">
          {items.map((item) =>
            item.children ? (
              <NavGroupMenu key={item.title + item.href} item={item} />
            ) : (
              <Link
                key={item.title + item.href}
                href={item.href}
                className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                {...(item.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                {item.title}
              </Link>
            ),
          )}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <Button asChild variant="ghost" size="icon" className="size-10">
            <Link href="/search" aria-label="검색">
              <SearchIcon />
            </Link>
          </Button>
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
