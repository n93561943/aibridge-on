import type { Metadata } from "next";

import { requireAdmin } from "@/lib/auth/current-user";
import { getAdminMenuTree } from "@/lib/menus/queries";

import { NewPostForm } from "./new-post-form";

export const metadata: Metadata = { title: "새 게시물" };

export default async function NewPostPage({
  searchParams,
}: {
  searchParams: Promise<{ menu?: string }>;
}) {
  await requireAdmin("/admin/posts/new");
  const [{ menu }, tree] = await Promise.all([searchParams, getAdminMenuTree()]);

  // 게시글(차시형 문서) 메뉴만. 공지사항(board) 글쓰기는 P5에서 만든다.
  const menus = tree.flatMap((node) =>
    [node, ...node.children]
      .filter((m) => m.type === "series")
      .map((m) => ({
        id: m.id,
        label: m.parent_id ? `${node.title} › ${m.title}` : m.title,
      })),
  );

  return (
    <div className="container-site flex max-w-xl flex-col gap-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">새 게시물</h1>
        <p className="text-sm text-muted-foreground">
          메뉴와 제목을 정하면 초안이 만들어지고 에디터가 열립니다.
        </p>
      </header>
      {menus.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-background p-6 text-center text-muted-foreground">
          게시글(차시형 문서) 메뉴가 없습니다. 메뉴 관리에서 먼저 만들어 주세요.
        </p>
      ) : (
        <NewPostForm
          menus={menus}
          defaultMenuId={menus.some((m) => m.id === menu) ? menu : undefined}
        />
      )}
    </div>
  );
}
