import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/current-user";
import { getAdminMenuTree } from "@/lib/menus/queries";
import { createClient } from "@/lib/supabase/server";

import { type PostMenuOption, PostsManager, type PostRow } from "./posts-manager";

export const metadata: Metadata = { title: "게시물" };

type SearchParams = { menu?: string; status?: string; q?: string };

/** ilike 패턴에서 특수 문자(%, _, \)를 글자 그대로 찾게 한다. */
function escapeLike(value: string) {
  return value.replace(/[%_\\]/g, (m) => `\\${m}`);
}

export default async function AdminPostsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin("/admin/posts");
  const params = await searchParams;
  const [tree, supabase] = await Promise.all([getAdminMenuTree(), createClient()]);

  // 게시물을 담을 수 있는 메뉴(게시글·게시판). 하위 메뉴는 "상위 › 하위"로 보여 준다.
  const menus: PostMenuOption[] = tree.flatMap((node) =>
    [node, ...node.children]
      .filter((m) => m.type === "series" || m.type === "board")
      .map((m) => ({
        id: m.id,
        type: m.type as "series" | "board",
        label: m.parent_id ? `${node.title} › ${m.title}` : m.title,
      })),
  );

  const menuId = menus.some((m) => m.id === params.menu) ? params.menu : undefined;
  const status =
    params.status === "draft" || params.status === "published" ? params.status : undefined;
  const q = params.q?.trim().slice(0, 100) || undefined;

  let query = supabase
    .from("posts")
    .select("id, title, lesson_no, status, draft_saved_at, updated_at, menu_id")
    .is("deleted_at", null)
    .limit(300);
  if (menuId) query = query.eq("menu_id", menuId).order("sort_order");
  else query = query.order("updated_at", { ascending: false });
  if (status) query = query.eq("status", status);
  if (q) query = query.ilike("title", `%${escapeLike(q)}%`);
  const { data } = await query;

  const posts: PostRow[] = (data ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    lessonNo: p.lesson_no,
    status: p.status === "published" ? "published" : "draft",
    editing: p.draft_saved_at !== null,
    menuId: p.menu_id,
  }));

  return (
    <div className="container-site flex flex-col gap-6 py-8">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">게시물</h1>
        <Link
          href="/admin/trash"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          휴지통
        </Link>
        <Button asChild className="ml-auto h-10">
          <Link href={menuId ? `/admin/posts/new?menu=${menuId}` : "/admin/posts/new"}>
            새 게시물
          </Link>
        </Button>
      </header>

      <form
        method="get"
        className="flex flex-wrap items-end gap-2 rounded-xl border bg-background p-3"
      >
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
          메뉴
          <select
            name="menu"
            defaultValue={menuId ?? ""}
            className="h-10 rounded-lg border bg-background px-2 text-base md:text-sm"
          >
            <option value="">전체</option>
            {menus.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-28 flex-col gap-1 text-sm">
          상태
          <select
            name="status"
            defaultValue={status ?? ""}
            className="h-10 rounded-lg border bg-background px-2 text-base md:text-sm"
          >
            <option value="">전체</option>
            <option value="published">공개</option>
            <option value="draft">초안</option>
          </select>
        </label>
        <label className="flex min-w-40 flex-[2] flex-col gap-1 text-sm">
          제목 검색
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            maxLength={100}
            className="h-10 rounded-lg border bg-background px-3 text-base md:text-sm"
          />
        </label>
        <Button type="submit" variant="outline" className="h-10">
          찾기
        </Button>
      </form>

      <PostsManager
        posts={posts}
        menus={menus}
        reorderMenuId={menuId && !status && !q ? menuId : null}
      />
    </div>
  );
}
