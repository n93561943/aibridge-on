"use client";

import { ChevronDownIcon, ExternalLinkIcon } from "lucide-react";
import Link from "next/link";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { NavItem } from "./nav-items";

/** 데스크톱 헤더의 그룹 메뉴(하위 메뉴 펼침) */
export function NavGroupMenu({ item }: { item: NavItem }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:text-foreground">
        {item.title}
        <ChevronDownIcon className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {item.children?.map((child) => (
          <DropdownMenuItem key={child.href} asChild>
            <Link
              href={child.href}
              {...(child.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              {child.title}
              {child.external && (
                <ExternalLinkIcon className="ml-auto text-muted-foreground" aria-label="새 탭" />
              )}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
