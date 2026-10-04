"use client";

import { ChevronDownIcon, LogOutIcon, SettingsIcon, UserIcon } from "lucide-react";
import Link from "next/link";

import { signOut } from "@/app/(site)/auth-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { roleLabels } from "@/lib/auth/roles";

import { PendingTeachersBadge } from "./pending-teachers-badge";
import type { HeaderViewer } from "./viewer";

export function UserMenu({ viewer }: { viewer: HeaderViewer }) {
  const name = viewer.nickname ?? "가입 진행 중";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 max-w-40 gap-1"
          aria-label={`내 계정: ${name}`}
        >
          <UserIcon />
          <span className="truncate">{name}</span>
          {!!viewer.pendingTeachers && (
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-destructive" />
          )}
          <ChevronDownIcon className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {viewer.role && <DropdownMenuLabel>{roleLabels[viewer.role]}</DropdownMenuLabel>}
        <DropdownMenuItem asChild>
          <Link href={viewer.nickname ? "/me" : "/signup"}>
            <UserIcon />
            {viewer.nickname ? "내 정보" : "가입 마치기"}
          </Link>
        </DropdownMenuItem>
        {viewer.role === "admin" && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <SettingsIcon />
              관리자
              <PendingTeachersBadge count={viewer.pendingTeachers} />
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <form action={signOut}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOutIcon />
              로그아웃
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
