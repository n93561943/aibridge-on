import "server-only";

import { getCurrentUser } from "@/lib/auth/current-user";
import { toUserRole } from "@/lib/auth/roles";
import { getSupabasePublicConfig } from "@/lib/env";
import { postPath, type MenuNode } from "@/lib/menus/tree";
import type { Block } from "@/lib/posts/content";
import { absoluteUrl } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { uploadUrlPrefix } from "./content";
import { buildCommentTree, type CommentNode, type CommentRow } from "./comment-tree";

export type BoardPostDetail = {
  id: string;
  title: string;
  slug: string;
  href: string;
  shareUrl: string;
  content: Block[];
  createdAt: string;
  author: string;
  isMine: boolean;
  isPinned: boolean;
  score: number;
  commentCount: number;
  myVote: number;
};

export type BoardDetailViewer = {
  userId: string | null;
  /** 활동 회원(투표·댓글·본인 글 관리) */
  isActive: boolean;
  isAdmin: boolean;
};

/** 화면에 그릴 수 있는 게시판 이미지 주소의 앞부분(사이트 Storage). 설정이 없으면 null. */
export function boardImagePrefix(): string | null {
  const config = getSupabasePublicConfig();
  return config ? uploadUrlPrefix(config.url) : null;
}

export async function getBoardDetailViewer(): Promise<BoardDetailViewer> {
  const user = await getCurrentUser();
  const isActive = user?.profile?.status === "active";
  return {
    userId: user?.id ?? null,
    isActive,
    isAdmin: isActive && toUserRole(user?.profile?.role) === "admin",
  };
}

async function nicknames(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (!unique.length) return new Map();
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("id, nickname")
    .in("id", unique);
  if (error) throw new Error(`작성자 조회 실패: ${error.message}`);
  return new Map(data.map((p) => [p.id, p.nickname]));
}

/** 로그인 회원의 투표(RLS: 본인 투표만) */
async function myVotes(
  targetType: "post" | "comment",
  ids: string[],
  viewer: BoardDetailViewer,
): Promise<Map<string, number>> {
  if (!viewer.userId || !ids.length) return new Map();
  const supabase = await createClient();
  const result = new Map<string, number>();
  // 주소 길이 제한을 넘지 않게 나눠 묻는다(댓글은 최대 500개).
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await supabase
      .from("votes")
      .select("target_id, value")
      .eq("target_type", targetType)
      .in("target_id", ids.slice(i, i + 100));
    if (error) throw new Error(`투표 조회 실패: ${error.message}`);
    for (const v of data) result.set(v.target_id, v.value);
  }
  return result;
}

/*
 * 공개 본문은 회원·비회원이 DB에서 직접 읽을 수 없다(컬럼 권한, P3 결정 1).
 * service role로 읽되 공개 조건(공개·휴지통 아님·숨김 아님)을 여기서 건다.
 * 점수·댓글 수가 자주 바뀌므로 캐시하지 않는다.
 */
export async function getBoardPost(
  menu: MenuNode,
  parent: MenuNode | null,
  slug: string,
  viewer: BoardDetailViewer,
): Promise<BoardPostDetail | null> {
  const { data } = await createAdminClient()
    .from("posts")
    .select("id, title, slug, content, created_at, score, comment_count, is_pinned, author_id")
    .eq("menu_id", menu.id)
    .eq("slug", slug)
    .eq("status", "published")
    .is("deleted_at", null)
    .is("hidden_at", null)
    .maybeSingle();
  if (!data) return null;

  const [authors, votes] = await Promise.all([
    nicknames([data.author_id]),
    myVotes("post", [data.id], viewer),
  ]);
  const href = postPath(menu, parent, data.slug);
  return {
    id: data.id,
    title: data.title,
    slug: data.slug,
    href,
    shareUrl: absoluteUrl(href),
    content: (data.content ?? []) as unknown as Block[],
    createdAt: data.created_at,
    author: (data.author_id && authors.get(data.author_id)) || "알 수 없음",
    isMine: !!viewer.userId && data.author_id === viewer.userId,
    isPinned: data.is_pinned,
    score: data.score,
    commentCount: data.comment_count,
    myVote: votes.get(data.id) ?? 0,
  };
}

/** 한 글에 불러오는 댓글 최대 개수(P5-4 결정: 한 번에 모두, "더 보기"는 나중에) */
export const MAX_COMMENTS = 500;

/**
 * 글의 댓글 트리. 숨김 댓글은 RLS로는 보이지 않아 답글이 고아가 되므로 service role로 읽고,
 * 삭제·숨김 댓글의 본문·작성자는 buildCommentTree가 화면에 보내지 않는다.
 */
export async function getBoardComments(
  postId: string,
  viewer: BoardDetailViewer,
): Promise<CommentNode[]> {
  const { data, error } = await createAdminClient()
    .from("comments")
    .select(
      "id, parent_id, depth, author_id, body, score, hidden_at, deleted_at, created_at, updated_at",
    )
    .eq("post_id", postId)
    .order("created_at")
    .limit(MAX_COMMENTS);
  if (error) throw new Error(`댓글 조회 실패: ${error.message}`);
  const rows = data as CommentRow[];
  const [authors, votes] = await Promise.all([
    nicknames(rows.map((r) => r.author_id)),
    myVotes(
      "comment",
      rows.map((r) => r.id),
      viewer,
    ),
  ]);
  return buildCommentTree(rows, { nicknames: authors, votes, viewerId: viewer.userId });
}
