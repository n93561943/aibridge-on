import "server-only";

import { getCurrentUser } from "@/lib/auth/current-user";
import { postPath, type MenuNode } from "@/lib/menus/tree";
import { absoluteUrl } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { decodeFeedCursor, encodeFeedCursor, feedCursorFilter, type FeedCursor } from "./cursor";
import {
  FEED_PAGE_SIZE,
  firstImageUrl,
  type FeedOrder,
  previewText,
  topPeriodStart,
} from "./format";

export type BoardPostCard = {
  id: string;
  title: string;
  href: string;
  shareUrl: string;
  createdAt: string;
  author: string;
  preview: string;
  imageUrl: string | null;
  score: number;
  commentCount: number;
  isPinned: boolean;
  /** 로그인 회원의 투표(-1·0·1). 비회원은 0. */
  myVote: number;
};

export type BoardFeedPage = { posts: BoardPostCard[]; nextCursor: string | null };

export type BoardViewer = {
  /** 투표할 수 있는 활동 회원인가(로그인 + 가입 완료 + 활동 상태) */
  canVote: boolean;
  /** 이 게시판에 글을 쓸 수 있는가(메뉴 글쓰기 등급, DB can_write_board) */
  canWrite: boolean;
};

const CARD_COLUMNS =
  "id, title, slug, created_at, score, comment_count, is_pinned, hot_rank, author_id, content, content_text" as const;

type CardRow = {
  id: string;
  title: string;
  slug: string;
  created_at: string;
  score: number;
  comment_count: number;
  is_pinned: boolean;
  hot_rank: number | null;
  author_id: string | null;
  content: unknown;
  content_text: string;
};

/*
 * 공개 본문은 비회원·회원이 DB에서 직접 읽을 수 없다(컬럼 권한, P3 결정 1).
 * 그래서 서버가 service role로 읽되, RLS 대신 공개 조건(공개·휴지통 아님·숨김 아님)을 직접 건다.
 * 투표 여부만은 사용자 세션으로 읽어 RLS(본인 투표만)를 그대로 따른다.
 */
function publicBoardPosts(menuId: string) {
  return createAdminClient()
    .from("posts")
    .select(CARD_COLUMNS)
    .eq("menu_id", menuId)
    .eq("status", "published")
    .is("deleted_at", null)
    .is("hidden_at", null);
}

function cursorOf(row: CardRow, order: FeedOrder): FeedCursor {
  switch (order.sort) {
    case "hot":
      return { sort: "hot", rank: row.hot_rank ?? 0, id: row.id };
    case "new":
      return { sort: "new", createdAt: row.created_at, id: row.id };
    case "top":
      return { sort: "top", score: row.score, createdAt: row.created_at, id: row.id };
  }
}

/** 고정글: 첫 페이지 맨 위에만, 정렬·기간과 관계없이 최신순 */
async function listPinned(menuId: string): Promise<CardRow[]> {
  const { data, error } = await publicBoardPosts(menuId)
    .eq("is_pinned", true)
    .order("created_at", { ascending: false })
    .limit(FEED_PAGE_SIZE);
  if (error) throw new Error(`고정글 조회 실패: ${error.message}`);
  return data;
}

async function listPage(
  menuId: string,
  order: FeedOrder,
  cursor: FeedCursor | null,
  now: Date,
): Promise<{ rows: CardRow[]; hasMore: boolean }> {
  let query = publicBoardPosts(menuId).eq("is_pinned", false);
  if (order.sort === "top") {
    const since = topPeriodStart(order.period, now);
    if (since) query = query.gte("created_at", since.toISOString());
  }
  if (cursor) query = query.or(feedCursorFilter(cursor));
  switch (order.sort) {
    case "hot":
      query = query.order("hot_rank", { ascending: false });
      break;
    case "new":
      query = query.order("created_at", { ascending: false });
      break;
    case "top":
      query = query.order("score", { ascending: false }).order("created_at", { ascending: false });
      break;
  }
  const { data, error } = await query.order("id", { ascending: false }).limit(FEED_PAGE_SIZE + 1);
  if (error) throw new Error(`게시판 글 조회 실패: ${error.message}`);
  return { rows: data.slice(0, FEED_PAGE_SIZE), hasMore: data.length > FEED_PAGE_SIZE };
}

/** 작성자 닉네임(공개 정보는 닉네임뿐) */
async function nicknames(authorIds: string[]): Promise<Map<string, string>> {
  if (authorIds.length === 0) return new Map();
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("id, nickname")
    .in("id", authorIds);
  if (error) throw new Error(`작성자 조회 실패: ${error.message}`);
  return new Map(data.map((p) => [p.id, p.nickname]));
}

/** 로그인 회원이 이 글들에 한 투표. RLS가 본인 투표만 보여 준다. */
async function myVotes(postIds: string[]): Promise<Map<string, number>> {
  if (postIds.length === 0 || !(await getCurrentUser())) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("votes")
    .select("target_id, value")
    .eq("target_type", "post")
    .in("target_id", postIds);
  if (error) throw new Error(`투표 조회 실패: ${error.message}`);
  return new Map(data.map((v) => [v.target_id, v.value]));
}

async function toCards(
  rows: CardRow[],
  menu: MenuNode,
  parent: MenuNode | null,
): Promise<BoardPostCard[]> {
  const ids = rows.map((r) => r.id);
  const authorIds = [...new Set(rows.flatMap((r) => (r.author_id ? [r.author_id] : [])))];
  const [authors, votes] = await Promise.all([nicknames(authorIds), myVotes(ids)]);
  return rows.map((row) => {
    const href = postPath(menu, parent, row.slug);
    return {
      id: row.id,
      title: row.title,
      href,
      shareUrl: absoluteUrl(href),
      createdAt: row.created_at,
      author: (row.author_id && authors.get(row.author_id)) || "알 수 없음",
      preview: previewText(row.content_text),
      imageUrl: firstImageUrl(row.content),
      score: row.score,
      commentCount: row.comment_count,
      isPinned: row.is_pinned,
      myVote: votes.get(row.id) ?? 0,
    };
  });
}

/**
 * 게시판 피드 한 페이지(20개). cursor가 없으면 첫 페이지이고 고정글을 맨 위에 붙인다.
 * 메뉴가 활성 board인지는 호출하는 쪽(공개 메뉴 트리)에서 이미 확인한다.
 * cursor가 올바르지 않으면 빈 페이지를 돌려준다.
 */
export async function getBoardFeedPage(
  menu: MenuNode,
  parent: MenuNode | null,
  order: FeedOrder,
  cursorValue: string | null,
  now = new Date(),
): Promise<BoardFeedPage> {
  let cursor: FeedCursor | null = null;
  if (cursorValue !== null) {
    cursor = decodeFeedCursor(cursorValue, order.sort);
    if (!cursor) return { posts: [], nextCursor: null };
  }
  const [pinned, page] = await Promise.all([
    cursor ? Promise.resolve([]) : listPinned(menu.id),
    listPage(menu.id, order, cursor, now),
  ]);
  const last = page.rows.at(-1);
  return {
    posts: await toCards([...pinned, ...page.rows], menu, parent),
    nextCursor: page.hasMore && last ? encodeFeedCursor(cursorOf(last, order)) : null,
  };
}

export async function getBoardViewer(menuId: string): Promise<BoardViewer> {
  const user = await getCurrentUser();
  if (!user?.profile || user.profile.status !== "active")
    return { canVote: false, canWrite: false };
  const supabase = await createClient();
  const { data } = await supabase.rpc("can_write_board", { p_menu_id: menuId });
  return { canVote: true, canWrite: data === true };
}
