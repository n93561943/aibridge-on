import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { menuTypeLabels } from "@/lib/menus/schema";
import { getPublicMenuTree } from "@/lib/menus/queries";
import { findMenuByPath, menuHref } from "@/lib/menus/tree";

export async function menuPageMetadata(segments: string[]): Promise<Metadata> {
  const found = findMenuByPath(await getPublicMenuTree(), segments);
  return found ? { title: found.menu.title } : {};
}

/**
 * 메뉴 주소(/[menu], /[menu]/[sub]) 공통 처리.
 * group은 첫 하위 메뉴로, link는 외부 주소로 보낸다. 차시 목록(P4)·게시판(P5) 전까지는 준비 중 화면.
 */
export async function MenuPage({ segments }: { segments: string[] }) {
  const found = findMenuByPath(await getPublicMenuTree(), segments);
  if (!found) notFound();
  const { menu, parent } = found;

  if (menu.type === "group" || menu.type === "link") {
    const target = menuHref(menu, parent);
    if (!target) notFound();
    redirect(target.href);
  }

  return (
    <div className="container-site flex flex-col gap-6 py-10 sm:py-16">
      <nav aria-label="현재 위치" className="text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/" className="hover:text-foreground">
              홈
            </Link>
          </li>
          {parent && (
            <li className="before:mr-1 before:content-['/']">
              <span>{parent.title}</span>
            </li>
          )}
          <li className="before:mr-1 before:content-['/']">
            <span aria-current="page" className="text-foreground">
              {menu.title}
            </span>
          </li>
        </ol>
      </nav>
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          {menuTypeLabels[menu.type as keyof typeof menuTypeLabels]}
        </p>
        <h1 className="text-2xl font-bold break-keep sm:text-3xl">{menu.title}</h1>
      </header>
      <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        아직 준비 중인 자료입니다. 곧 공개할게요.
      </p>
    </div>
  );
}
