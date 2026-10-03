import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "게시물" };

// 목록 필터·검색·일괄 이동·휴지통은 P3-3에서 채운다.
export default async function AdminPostsPage() {
  await requireAdmin("/admin/posts");
  const supabase = await createClient();
  const { data: posts } = await supabase
    .from("posts")
    .select("id, title, lesson_no, status, draft_saved_at, updated_at, menus(title)")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(100);

  return (
    <div className="container-site flex flex-col gap-6 py-8">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">게시물</h1>
        <Button asChild className="ml-auto h-10">
          <Link href="/admin/posts/new">새 게시물</Link>
        </Button>
      </header>
      {!posts?.length ? (
        <p className="rounded-xl border border-dashed bg-background p-8 text-center text-muted-foreground">
          아직 게시물이 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {posts.map((post) => (
            <li key={post.id}>
              <Link
                href={`/admin/posts/${post.id}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border bg-background p-3 hover:bg-muted/50"
              >
                <span className="min-w-0 flex-1 font-medium break-keep">
                  {post.lesson_no !== null && (
                    <span className="mr-1 text-muted-foreground">{post.lesson_no}차시</span>
                  )}
                  {post.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  {(post.menus as { title: string } | null)?.title ?? "메뉴 없음"}
                </span>
                <span
                  className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${post.status === "published" ? "bg-emerald-100 text-emerald-900" : "bg-muted text-muted-foreground"}`}
                >
                  {post.status === "published"
                    ? post.draft_saved_at
                      ? "공개 · 수정 중"
                      : "공개"
                    : "초안"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
