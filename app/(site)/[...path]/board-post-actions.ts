"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

import { COMMENT_MAX_LENGTH } from "@/lib/board/comment-tree";
import { reportInputSchema } from "@/lib/board/report";
import { findActiveBoard, getActiveMember, writeAccessMessages } from "@/lib/board/write";
import { getCurrentUser } from "@/lib/auth/current-user";
import { toUserRole } from "@/lib/auth/roles";
import { menuPath } from "@/lib/menus/tree";
import { POSTS_CACHE_TAG } from "@/lib/posts/public";
import { createClient } from "@/lib/supabase/server";

/*
 * 게시판 글 상세의 댓글·글 관리 액션(F-08).
 * 권한: 화면(버튼 노출) + 여기(활동 회원·작성자·관리자) + DB(RLS·트리거: 댓글 허용 게시판·5단계·10초 제한·
 * 작성자만 수정·관리 항목 보호). 결과를 돌려준 뒤 화면이 router.refresh()로 다시 그린다.
 */

export type ActionResult = { ok: true } | { ok: false; message: string };

const RETRY = "잠시 후 다시 시도해 주세요.";

const bodySchema = z
  .string()
  .trim()
  .min(1, "댓글을 입력해 주세요.")
  .max(COMMENT_MAX_LENGTH, `댓글은 ${COMMENT_MAX_LENGTH.toLocaleString()}자 이하여야 합니다.`);

function commentErrorMessage(error: { code?: string; message: string }): string {
  // 10초에 1개(P0429), 5단계·삭제된 댓글에 답글(23514·23503: set_comment_depth)
  if (error.code === "P0429" || error.code === "23514" || error.code === "23503") {
    return error.message;
  }
  if (error.code === "42501") return "댓글을 쓸 수 없는 글입니다. 새로고침해 주세요.";
  return `댓글을 저장하지 못했습니다. ${RETRY}`;
}

const addSchema = z.object({
  postId: z.uuid(),
  parentId: z.uuid().nullable(),
  body: z.unknown(),
});

export async function addComment(input: z.input<typeof addSchema>): Promise<ActionResult> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "잘못된 요청입니다." };
  const body = bodySchema.safeParse(parsed.data.body);
  if (!body.success) return { ok: false, message: body.error.issues[0].message };
  const member = await getActiveMember();
  if (!member.ok) return { ok: false, message: writeAccessMessages[member.reason] };

  const supabase = await createClient();
  const { error } = await supabase.from("comments").insert({
    post_id: parsed.data.postId,
    parent_id: parsed.data.parentId,
    body: body.data,
  });
  if (error) return { ok: false, message: commentErrorMessage(error) };
  return { ok: true };
}

const editSchema = z.object({ commentId: z.uuid(), body: z.unknown() });

/** 본인 댓글 수정(RLS: 작성자·삭제/숨김 아님·활동 회원) */
export async function editComment(input: z.input<typeof editSchema>): Promise<ActionResult> {
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "잘못된 요청입니다." };
  const body = bodySchema.safeParse(parsed.data.body);
  if (!body.success) return { ok: false, message: body.error.issues[0].message };
  const member = await getActiveMember();
  if (!member.ok) return { ok: false, message: writeAccessMessages[member.reason] };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comments")
    .update({ body: body.data })
    .eq("id", parsed.data.commentId)
    .eq("author_id", member.userId)
    .select("id");
  if (error) return { ok: false, message: `수정하지 못했습니다. ${RETRY}` };
  if (!data.length) return { ok: false, message: "고칠 수 없는 댓글입니다." };
  return { ok: true };
}

const idSchema = z.uuid();

async function adminOrMember() {
  const user = await getCurrentUser();
  const active = user?.profile?.status === "active";
  return {
    userId: active ? user!.id : null,
    isAdmin: active && toUserRole(user?.profile?.role) === "admin",
  };
}

/** 댓글 삭제: 작성자 본인 또는 관리자. 본문을 비우고 답글이 있으면 자리만 남는다(touch_comment). */
export async function deleteComment(commentId: string): Promise<ActionResult> {
  const id = idSchema.safeParse(commentId);
  if (!id.success) return { ok: false, message: "잘못된 요청입니다." };
  const viewer = await adminOrMember();
  if (!viewer.userId) return { ok: false, message: "로그인해 주세요." };

  const supabase = await createClient();
  let query = supabase
    .from("comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id.data)
    .is("deleted_at", null);
  if (!viewer.isAdmin) query = query.eq("author_id", viewer.userId);
  const { data, error } = await query.select("id");
  if (error) return { ok: false, message: `삭제하지 못했습니다. ${RETRY}` };
  if (!data.length) return { ok: false, message: "삭제할 수 없는 댓글입니다." };
  return { ok: true };
}

const postActionSchema = z.object({ menuId: z.uuid(), postId: z.uuid() });

/**
 * 글 삭제(휴지통, 30일 뒤 영구 삭제·관리자 복구 가능): 작성자 본인 또는 관리자.
 * 성공하면 게시판 목록 주소를 돌려준다.
 */
export async function trashBoardPost(
  input: z.input<typeof postActionSchema>,
): Promise<{ ok: true; href: string } | { ok: false; message: string }> {
  const parsed = postActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "잘못된 요청입니다." };
  const board = await findActiveBoard(parsed.data.menuId);
  if (!board) return { ok: false, message: "게시판을 찾을 수 없습니다." };
  const viewer = await adminOrMember();
  if (!viewer.userId) return { ok: false, message: "로그인해 주세요." };

  const supabase = await createClient();
  let query = supabase
    .from("posts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", parsed.data.postId)
    .eq("menu_id", board.menu.id)
    .is("deleted_at", null);
  if (!viewer.isAdmin) query = query.eq("author_id", viewer.userId);
  const { data, error } = await query.select("id");
  if (error) return { ok: false, message: `삭제하지 못했습니다. ${RETRY}` };
  if (!data.length) return { ok: false, message: "삭제할 수 없는 글입니다." };

  revalidateTag(POSTS_CACHE_TAG);
  revalidatePath("/admin/trash");
  return { ok: true, href: menuPath(board.menu, board.parent)! };
}

/** 고정/해제: 관리자만(RLS·트리거도 회원의 is_pinned 변경을 막는다) */
export async function setBoardPostPinned(
  input: z.input<typeof postActionSchema> & { pinned: boolean },
): Promise<ActionResult> {
  const parsed = postActionSchema.extend({ pinned: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "잘못된 요청입니다." };
  const viewer = await adminOrMember();
  if (!viewer.isAdmin) return { ok: false, message: "관리자만 고정할 수 있습니다." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .update({ is_pinned: parsed.data.pinned })
    .eq("id", parsed.data.postId)
    .eq("menu_id", parsed.data.menuId)
    .select("id");
  if (error || !data.length) return { ok: false, message: `바꾸지 못했습니다. ${RETRY}` };
  revalidateTag(POSTS_CACHE_TAG);
  return { ok: true };
}

/**
 * 글·댓글 신고. 권한: 화면(본인 글·댓글엔 버튼 없음) + 여기(활동 회원·본인 것 아님)
 * + DB(RLS: 활동 회원·열린 게시판 글, 같은 대상 열린 신고는 한 번).
 */
export async function reportContent(
  input: z.input<typeof reportInputSchema>,
): Promise<ActionResult> {
  const parsed = reportInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const member = await getActiveMember();
  if (!member.ok) return { ok: false, message: writeAccessMessages[member.reason] };
  const { targetType, targetId, reason, detail } = parsed.data;

  // 본인 글·댓글은 신고할 수 없다(공개 글·댓글의 작성자 id는 RLS로 읽을 수 있다).
  const supabase = await createClient();
  const { data: target } =
    targetType === "post"
      ? await supabase.from("posts").select("author_id").eq("id", targetId).maybeSingle()
      : await supabase.from("comments").select("author_id").eq("id", targetId).maybeSingle();
  if (!target) return { ok: false, message: "신고할 수 없는 글이나 댓글입니다." };
  if (target.author_id === member.userId) {
    return { ok: false, message: "내가 쓴 글이나 댓글은 신고할 수 없습니다." };
  }

  const { error } = await supabase
    .from("reports")
    .insert({ target_type: targetType, target_id: targetId, reason, detail });
  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: "이미 신고했습니다. 관리자가 확인하고 있습니다." };
    }
    if (error.code === "42501") return { ok: false, message: "신고할 수 없는 글이나 댓글입니다." };
    return { ok: false, message: `신고하지 못했습니다. ${RETRY}` };
  }
  revalidatePath("/admin/reports");
  return { ok: true };
}
