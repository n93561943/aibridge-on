import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/current-user";
import { getAdminMenuTree } from "@/lib/menus/queries";
import { postPath } from "@/lib/menus/tree";
import { getPostForEditor } from "@/lib/posts/editor";
import { getOnlineJudgeTemplate } from "@/lib/settings/queries";

import { EditorShell } from "./editor-shell";

export const metadata: Metadata = { title: "게시물 편집" };

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin(`/admin/posts/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  const [post, judgeUrlTemplate, tree] = await Promise.all([
    getPostForEditor(id),
    getOnlineJudgeTemplate(),
    getAdminMenuTree(),
  ]);
  if (!post) notFound();

  // 공개 주소(관리자는 초안·수정본을 ?preview=1로 미리 본다). 메뉴가 비활성이면 공개 주소도 열리지 않는다.
  const parent = tree.find((n) => n.children.some((c) => c.id === post.menuId)) ?? null;
  const menu = parent
    ? parent.children.find((c) => c.id === post.menuId)
    : tree.find((n) => n.id === post.menuId);
  const publicPath =
    menu && menu.is_active && (!parent || parent.is_active)
      ? postPath(menu, parent, post.slug)
      : null;

  return <EditorShell post={post} judgeUrlTemplate={judgeUrlTemplate} publicPath={publicPath} />;
}
