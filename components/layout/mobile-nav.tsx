"use client";

import { MenuIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { siteConfig } from "@/lib/site";

import type { NavItem } from "./nav-items";

export function MobileNav({ items }: { items: NavItem[] }) {
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
              <MobileNavLink key={item.href} item={item} onNavigate={() => setOpen(false)} />
            ))
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function MobileNavLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  return (
    <div>
      <Link
        href={item.href}
        onClick={onNavigate}
        className="block rounded-md px-2 py-2 font-medium hover:bg-accent"
        {...(item.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {item.title}
      </Link>
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
