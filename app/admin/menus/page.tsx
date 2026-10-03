import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/current-user";
import { getAdminMenuTree } from "@/lib/menus/queries";

import { MenuManager } from "./menu-manager";

export const metadata: Metadata = { title: "메뉴 관리" };

export default async function AdminMenusPage() {
  await requireAdmin("/admin/menus");
  const tree = await getAdminMenuTree();

  return (
    <div className="container-site flex flex-col gap-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">메뉴 관리</h1>
        <p className="text-sm text-muted-foreground">
          헤더에 보이는 메뉴를 만들고 순서를 바꿉니다. 바꾼 내용은 사이트에 바로 반영됩니다.
        </p>
      </header>
      <MenuManager tree={tree} />
    </div>
  );
}
