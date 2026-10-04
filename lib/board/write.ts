import "server-only";

import { getCurrentUser } from "@/lib/auth/current-user";
import { getPublicMenuTree } from "@/lib/menus/queries";
import type { MenuNode } from "@/lib/menus/tree";
import type { Block } from "@/lib/posts/content";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** 활성 게시판 메뉴와 그 상위 메뉴. 공개 메뉴 트리에 없으면 null. */
export async function findActiveBoard(
  menuId: string,
): Promise<{ menu: MenuNode; parent: MenuNode | null } | null> {
  for (const root of await getPublicMenuTree()) {
    if (!root.is_active) continue;
    if (root.id === menuId) return root.type === "board" ? { menu: root, parent: null } : null;
    const child = root.children.find((c) => c.id === menuId);
    if (child) {
      return child.type === "board" && child.is_active ? { menu: child, parent: root } : null;
    }
  }
  return null;
}

/**
 * 글쓰기 화면에서 보여 줄 상태. 권한이 없으면 이유를 보여 준다.
 * 최종 판단은 DB(can_write_board, RLS·트리거)가 한다.
 */
export type WriteAccess =
  { ok: true; userId: string } | { ok: false; reason: "login" | "signup" | "inactive" | "role" };

/** 활동 회원인가(로그인 + 가입 완료 + 활동 상태). 본인 글 수정은 이것만 본다. */
export async function getActiveMember(): Promise<WriteAccess> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "login" };
  if (!user.profile) return { ok: false, reason: "signup" };
  if (user.profile.status !== "active") return { ok: false, reason: "inactive" };
  return { ok: true, userId: user.id };
}

/** 활동 회원 + 이 게시판 글쓰기 등급 이상(DB can_write_board) */
export async function getWriteAccess(menuId: string): Promise<WriteAccess> {
  const member = await getActiveMember();
  if (!member.ok) return member;
  const supabase = await createClient();
  const { data } = await supabase.rpc("can_write_board", { p_menu_id: menuId });
  return data === true ? member : { ok: false, reason: "role" };
}

export const writeAccessMessages: Record<Exclude<WriteAccess, { ok: true }>["reason"], string> = {
  login: "글을 쓰려면 로그인해 주세요.",
  signup: "가입을 마치면 글을 쓸 수 있습니다.",
  inactive: "보호자 동의를 기다리거나 이용이 정지된 계정은 글을 쓸 수 없습니다.",
  role: "이 게시판에 글을 쓸 수 있는 등급이 아닙니다.",
};

export type OwnBoardPost = { id: string; menuId: string; title: string; content: Block[] };

/**
 * 수정 화면용 본인 글. 본문 컬럼은 회원이 직접 읽을 수 없어(P3 결정 1) service role로 읽되,
 * 작성자·휴지통·숨김 조건을 여기서 건다. 남의 글이면 null(→ 404).
 */
export async function getOwnBoardPost(
  menuId: string,
  slug: string,
  userId: string,
): Promise<OwnBoardPost | null> {
  const { data } = await createAdminClient()
    .from("posts")
    .select("id, menu_id, title, content")
    .eq("menu_id", menuId)
    .eq("slug", slug)
    .eq("author_id", userId)
    .is("deleted_at", null)
    .is("hidden_at", null)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    menuId: data.menu_id!,
    title: data.title,
    content: (data.content ?? []) as unknown as Block[],
  };
}
