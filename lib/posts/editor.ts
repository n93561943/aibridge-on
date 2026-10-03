import "server-only";

import { randomBytes } from "node:crypto";

import { createClient } from "@/lib/supabase/server";

import type { Block } from "./content";

/** 자동 저장 때 이력을 남기는 최소 간격. 직접 저장·공개·복원은 항상 남긴다. */
export const REVISION_INTERVAL_MS = 10 * 60 * 1000;

/** 관리자 목록·에디터에서 읽는 게시물 메타 컬럼(본문 제외). select("*")는 컬럼 권한 때문에 실패한다. */
export const POST_META_COLUMNS =
  "id, menu_id, title, slug, lesson_no, sort_order, summary, status, published_at, draft_saved_at, deleted_at, created_at, updated_at" as const;

export function newPostSlug(): string {
  return `post-${randomBytes(3).toString("hex")}`;
}

export type EditorPost = {
  id: string;
  menuId: string | null;
  menuTitle: string | null;
  title: string;
  slug: string;
  lessonNo: number | null;
  summary: string | null;
  status: "draft" | "published";
  deletedAt: string | null;
  updatedAt: string;
  /** 에디터에 띄울 제목·본문: 공개 글에 미공개 수정본이 있으면 그것 */
  editingTitle: string;
  editingContent: Block[];
  hasUnpublishedChanges: boolean;
};

/** 관리자 에디터용 게시물. 관리자가 아니면 RPC가 거부한다. 없으면 null. */
export async function getPostForEditor(id: string): Promise<EditorPost | null> {
  const supabase = await createClient();
  const { data: post } = await supabase
    .from("posts")
    .select(`${POST_META_COLUMNS}, menus(title)`)
    .eq("id", id)
    .maybeSingle();
  if (!post) return null;

  const { data: rows, error } = await supabase.rpc("get_post_editor_content", { p_post_id: id });
  if (error || !rows?.[0])
    throw new Error(`본문을 불러오지 못했습니다: ${error?.message ?? "없음"}`);
  const body = rows[0];
  const hasDraft = body.draft_content !== null || body.draft_title !== null;

  return {
    id: post.id,
    menuId: post.menu_id,
    menuTitle: (post.menus as { title: string } | null)?.title ?? null,
    title: post.title,
    slug: post.slug,
    lessonNo: post.lesson_no,
    summary: post.summary,
    status: post.status === "published" ? "published" : "draft",
    deletedAt: post.deleted_at,
    updatedAt: post.updated_at,
    editingTitle: body.draft_title ?? post.title,
    editingContent: ((hasDraft ? (body.draft_content ?? body.content) : body.content) ??
      []) as Block[],
    hasUnpublishedChanges: hasDraft,
  };
}
