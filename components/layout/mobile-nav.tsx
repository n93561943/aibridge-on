"use client";

import { MenuIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { signOut } from "@/app/(site)/auth-actions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { siteConfig } from "@/lib/site";

import type { NavItem } from "./nav-items";
import type { HeaderViewer } from "./viewer";

export function MobileNav({ items, viewer }: { items: NavItem[]; viewer: HeaderViewer | null }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="size-10 md:hidden" aria-label="메뉴 열기">
          <MenuIcon />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72">
        <SheetHeader>
          <SheetTitle>{siteConfig.name}</SheetTitle>
        </SheetHeader>
        <nav aria-label="모바일 메뉴" className="flex flex-col gap-1 px-4">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">준비 중인 메뉴입니다.</p>
          ) : (
            items.map((item) => (
              <MobileNavLink
                key={item.title + item.href}
                item={item}
                onNavigate={() => setOpen(false)}
              />
            ))
          )}
        </nav>
        <div className="mt-auto flex flex-col gap-1 border-t px-4 py-4">
          {viewer ? (
            <>
              <Link
                href={viewer.nickname ? "/me" : "/signup"}
                onClick={() => setOpen(false)}
                className="block rounded-md px-2 py-2 font-medium hover:bg-accent"
              >
                {viewer.nickname ? `내 정보 (${viewer.nickname})` : "가입 마치기"}
              </Link>
              {viewer.role === "admin" && (
                <Link
                  href="/admin/menus"
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-2 py-2 font-medium hover:bg-accent"
                >
                  관리자
                </Link>
              )}
              <form action={signOut}>
                <button
                  type="submit"
                  className="block w-full rounded-md px-2 py-2 text-left font-medium hover:bg-accent"
                >
                  로그아웃
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="block rounded-md px-2 py-2 font-medium hover:bg-accent"
            >
              로그인
            </Link>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MobileNavLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  return (
    <div>
      {item.children ? (
        // 그룹 메뉴는 자체 페이지가 없으므로 제목만 보여 주고 하위 메뉴를 펼쳐 둔다.
        <p className="px-2 pt-2 pb-1 text-sm font-semibold text-muted-foreground">{item.title}</p>
      ) : (
        <Link
          href={item.href}
          onClick={onNavigate}
          className="block rounded-md px-2 py-2 font-medium hover:bg-accent"
          {...(item.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {item.title}
        </Link>
      )}
      {item.children && item.children.length > 0 && (
        <div className="ml-3 flex flex-col border-l pl-2">
          {item.children.map((child) => (
            <MobileNavLink key={child.href} item={child} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}
