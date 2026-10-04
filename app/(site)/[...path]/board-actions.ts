"use server";

import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/current-user";
import { type BoardFeedPage, getBoardFeedPage } from "@/lib/board/feed";
import { parseFeedOrder } from "@/lib/board/format";
import { getPublicMenuTree } from "@/lib/menus/queries";
import type { MenuNode } from "@/lib/menus/tree";
import { createClient } from "@/lib/supabase/server";

const loadMoreSchema = z.object({
  menuId: z.uuid(),
  sort: z.string().max(10),
  period: z.string().max(10),
  cursor: z.string().min(1).max(500),
});

/** 활성 게시판 메뉴와 그 상위 메뉴. 공개 메뉴 트리에 없으면 null. */
async function findActiveBoard(
  menuId: string,
): Promise<{ menu: MenuNode; parent: MenuNode | null } | null> {
  for (const root of await getPublicMenuTree()) {
    if (!root.is_active) continue;
    if (root.id === menuId) return root.type === "board" ? { menu: root, parent: null } : null;
    const child = root.children.find((c) => c.id === menuId);
    if (child)
      return child.type === "board" && child.is_active ? { menu: child, parent: root } : null;
  }
  return null;
}

/** 무한 스크롤: 다음 20개. 비회원도 부를 수 있다(공개 글만 돌려준다). */
export async function loadMoreBoardPosts(input: {
  menuId: string;
  sort: string;
  period: string;
  cursor: string;
}): Promise<BoardFeedPage> {
  const parsed = loadMoreSchema.safeParse(input);
  if (!parsed.success) return { posts: [], nextCursor: null };
  const board = await findActiveBoard(parsed.data.menuId);
  if (!board) return { posts: [], nextCursor: null };
  return getBoardFeedPage(
    board.menu,
    board.parent,
    parseFeedOrder(parsed.data.sort, parsed.data.period),
    parsed.data.cursor,
  );
}

export type VoteResult =
  { ok: true; score: number; myVote: number } | { ok: false; message: string };

const voteSchema = z.object({
  postId: z.uuid(),
  value: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
});

/**
 * 글 추천/비추천/취소. 화면이 "다시 누르면 취소, 반대면 전환"을 계산해 원하는 값을 보낸다.
 * 권한: 화면(비회원 안내) + 여기(활동 회원) + DB(cast_vote: 활동 회원·투표 허용 게시판·공개 글).
 */
export async function votePost(input: { postId: string; value: number }): Promise<VoteResult> {
  const parsed = voteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "잘못된 요청입니다." };

  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "투표하려면 로그인해 주세요." };
  if (!user.profile) return { ok: false, message: "가입을 마치면 투표할 수 있습니다." };
  if (user.profile.status !== "active") {
    return { ok: false, message: "지금은 투표할 수 없는 계정 상태입니다." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cast_vote", {
    p_target_type: "post",
    p_target_id: parsed.data.postId,
    p_value: parsed.data.value,
  });
  const row = data?.[0];
  if (error || !row) {
    return {
      ok: false,
      message:
        error?.code === "P0002"
          ? "투표할 수 없는 글입니다. 새로고침해 주세요."
          : "투표하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
  return { ok: true, score: row.score, myVote: row.my_vote };
}
