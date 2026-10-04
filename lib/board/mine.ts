import "server-only";

import { getPublicMenuTree } from "@/lib/menus/queries";
import { findMenuById, postPath } from "@/lib/menus/tree";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** /me에 보여 줄 최근 글·댓글 수 */
export const MY_LIST_LIMIT = 50;

export type MyPostStatus = "visible" | "hidden" | "trashed";

export type MyPost = {
  id: string;
  title: string;
  boardTitle: string | null;
  createdAt: string;
  deletedAt: string | null;
  score: number;
  commentCount: number;
  status: MyPostStatus;
  /** 공개 화면 주소(보이는 글만) */
  href: string | null;
};

export type MyComment = {
  id: string;
  excerpt: string;
  createdAt: string;
  hidden: boolean;
  postTitle: string;
  /** 댓글이 달린 글 주소(글이 보일 때만) */
  href: string | null;
};

/**
 * 내 게시판 글(최근 50개, 휴지통·숨김 포함). 글은 회원 세션으로 읽고(RLS "본인 게시물 조회"),
 * 메뉴 종류는 service role로 확인해 게시판 글만 남긴다(관리자가 쓴 차시 글 제외).
 */
export async function listMyBoardPosts(userId: string): Promise<MyPost[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .select("id, menu_id, title, slug, created_at, score, comment_count, hidden_at, deleted_at")
    .eq("author_id", userId)
    .order("created_at", { ascending: false })
    .limit(MY_LIST_LIMIT * 2);
  if (error) throw new Error(`내 글 조회 실패: ${error.message}`);

  const menuIds = [...new Set(data.flatMap((p) => (p.menu_id ? [p.menu_id] : [])))];
  const [{ data: menus }, tree] = await Promise.all([
    menuIds.length
      ? createAdminClient().from("menus").select("id, type, title").in("id", menuIds)
      : Promise.resolve({ data: [] as { id: string; type: string; title: string }[] }),
    getPublicMenuTree(),
  ]);
  const boards = new Map((menus ?? []).filter((m) => m.type === "board").map((m) => [m.id, m]));

  return data
    .filter((p) => p.menu_id && boards.has(p.menu_id))
    .slice(0, MY_LIST_LIMIT)
    .map((p) => {
      const status: MyPostStatus = p.deleted_at ? "trashed" : p.hidden_at ? "hidden" : "visible";
      const found = status === "visible" ? findMenuById(tree, p.menu_id!) : null;
      return {
        id: p.id,
        title: p.title,
        boardTitle: boards.get(p.menu_id!)?.title ?? null,
        createdAt: p.created_at,
        deletedAt: p.deleted_at,
        score: p.score,
        commentCount: p.comment_count,
        status,
        href: found ? postPath(found.menu, found.parent, p.slug) : null,
      };
    });
}

/**
 * 내 댓글(최근 50개, 삭제한 댓글 제외). 댓글은 회원 세션으로 읽고(RLS "본인 댓글 조회"),
 * 댓글이 달린 글의 제목·주소는 그 글 id로만 좁혀 service role로 읽는다(휴지통·숨김 글도 제목은 보이게).
 */
export async function listMyComments(userId: string): Promise<MyComment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comments")
    .select("id, post_id, body, created_at, hidden_at")
    .eq("author_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(MY_LIST_LIMIT);
  if (error) throw new Error(`내 댓글 조회 실패: ${error.message}`);

  const postIds = [...new Set(data.map((c) => c.post_id))];
  const [{ data: posts }, tree] = await Promise.all([
    postIds.length
      ? createAdminClient()
          .from("posts")
          .select("id, menu_id, title, slug, status, hidden_at, deleted_at")
          .in("id", postIds)
      : Promise.resolve({ data: [] }),
    getPublicMenuTree(),
  ]);
  const postById = new Map((posts ?? []).map((p) => [p.id, p]));

  return data.map((c) => {
    const post = postById.get(c.post_id);
    const visible =
      post && post.status === "published" && !post.hidden_at && !post.deleted_at && post.menu_id;
    const found = visible ? findMenuById(tree, post.menu_id!) : null;
    return {
      id: c.id,
      excerpt: c.body.replace(/\s+/g, " ").trim().slice(0, 120),
      createdAt: c.created_at,
      hidden: !!c.hidden_at,
      postTitle: post?.title ?? "(지워진 글)",
      href: found ? `${postPath(found.menu, found.parent, post!.slug)}#comments` : null,
    };
  });
}
