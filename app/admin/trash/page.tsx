import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth/current-user";
import { getAdminMenuTree } from "@/lib/menus/queries";
import { TRASH_RETENTION_DAYS } from "@/lib/posts/constants";
import { createClient } from "@/lib/supabase/server";

import { TrashManager, type TrashRow } from "./trash-manager";

export const metadata: Metadata = { title: "휴지통" };

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function TrashPage() {
  await requireAdmin("/admin/trash");
  const [supabase, tree] = await Promise.all([createClient(), getAdminMenuTree()]);
  const { data } = await supabase
    .from("posts")
    .select("id, title, lesson_no, deleted_at, menus(title)")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(300);

  const now = Date.now();
  const rows: TrashRow[] = (data ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    lessonNo: p.lesson_no,
    menuTitle: (p.menus as { title: string } | null)?.title ?? null,
    daysLeft: Math.max(
      0,
      Math.ceil((new Date(p.deleted_at!).getTime() + TRASH_RETENTION_DAYS * DAY_MS - now) / DAY_MS),
    ),
  }));
  const menus = tree.flatMap((node) =>
    [node, ...node.children]
      .filter((m) => m.type === "series" || m.type === "board")
      .map((m) => ({ id: m.id, label: m.parent_id ? `${node.title} › ${m.title}` : m.title })),
  );

  return (
    <div className="container-site flex flex-col gap-6 py-8">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">휴지통</h1>
          <Link
            href="/admin/posts"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            게시물로
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          휴지통에 들어온 지 {TRASH_RETENTION_DAYS}일이 지나면 첨부 파일과 함께 영구 삭제됩니다.
        </p>
      </header>
      <TrashManager rows={rows} menus={menus} />
    </div>
  );
}
