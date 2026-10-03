import "server-only";

import { unstable_cache } from "next/cache";

import { getCurrentUser } from "@/lib/auth/current-user";
import { toUserRole } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";

import { type Block, stripTeacherOnlyBlocks } from "./content";

/** 게시물이 바뀌면 revalidateTag(POSTS_CACHE_TAG)로 공개 화면 캐시를 바로 지운다. */
export const POSTS_CACHE_TAG = "posts";

export type PublicPostSummary = {
  id: string;
  title: string;
  slug: string;
  lessonNo: number | null;
  summary: string | null;
  publishedAt: string | null;
};

export type PublicPost = PublicPostSummary & {
  menuId: string;
  content: Block[];
  contentText: string;
  updatedAt: string;
};

export type Viewer = { canSeeTeacherOnly: boolean; isAdmin: boolean };

/** 교사 전용 박스를 볼 수 있는가: 승인된 교사(role=teacher)·관리자, 활동 중인 계정 */
export async function getViewer(): Promise<Viewer> {
  const user = await getCurrentUser();
  const profile = user?.profile;
  if (!profile || profile.status !== "active") return { canSeeTeacherOnly: false, isAdmin: false };
  const role = toUserRole(profile.role);
  return { canSeeTeacherOnly: role === "teacher" || role === "admin", isAdmin: role === "admin" };
}

/*
 * 공개 본문은 비회원·회원이 DB에서 직접 읽을 수 없다(컬럼 권한, P3 결정 1).
 * 그래서 서버가 service role로 읽되, RLS를 대신해 공개 조건(공개·휴지통 아님·숨김 아님)을 직접 건다.
 * 교사 전용 블록은 보는 사람에 따라 서버에서 뺀 뒤 내려준다.
 */

const SUMMARY_COLUMNS = "id, title, slug, lesson_no, summary, published_at" as const;

function toSummary(row: {
  id: string;
  title: string;
  slug: string;
  lesson_no: number | null;
  summary: string | null;
  published_at: string | null;
}): PublicPostSummary {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    lessonNo: row.lesson_no,
    summary: row.summary,
    publishedAt: row.published_at,
  };
}

/** 메뉴의 공개 글 목록(차시 순서). 메뉴 활성 여부는 호출하는 쪽(메뉴 트리)에서 이미 확인한다. */
export const listPublishedPosts = unstable_cache(
  async (menuId: string): Promise<PublicPostSummary[]> => {
    const { data, error } = await createAdminClient()
      .from("posts")
      .select(SUMMARY_COLUMNS)
      .eq("menu_id", menuId)
      .eq("status", "published")
      .is("deleted_at", null)
      .is("hidden_at", null)
      .order("sort_order");
    if (error) throw new Error(`게시물 목록 조회 실패: ${error.message}`);
    return data.map(toSummary);
  },
  ["published-posts"],
  { tags: [POSTS_CACHE_TAG], revalidate: 3600 },
);

/** 공개 글 원본(교사 전용 블록 포함). 화면에 내보내기 전에 반드시 forViewer로 거른다. */
const getPublishedPostRaw = unstable_cache(
  async (menuId: string, slug: string): Promise<PublicPost | null> => {
    const { data, error } = await createAdminClient()
      .from("posts")
      .select(`${SUMMARY_COLUMNS}, menu_id, content, content_text, updated_at`)
      .eq("menu_id", menuId)
      .eq("slug", slug)
      .eq("status", "published")
      .is("deleted_at", null)
      .is("hidden_at", null)
      .maybeSingle();
    if (error) throw new Error(`게시물 조회 실패: ${error.message}`);
    if (!data) return null;
    return {
      ...toSummary(data),
      menuId: data.menu_id!,
      content: (data.content ?? []) as unknown as Block[],
      contentText: data.content_text,
      updatedAt: data.updated_at,
    };
  },
  ["published-post"],
  { tags: [POSTS_CACHE_TAG], revalidate: 3600 },
);

function forViewer(post: PublicPost, viewer: Viewer): PublicPost {
  return viewer.canSeeTeacherOnly
    ? post
    : { ...post, content: stripTeacherOnlyBlocks(post.content) };
}

export async function getPublishedPost(
  menuId: string,
  slug: string,
  viewer: Viewer,
): Promise<PublicPost | null> {
  const post = await getPublishedPostRaw(menuId, slug);
  return post ? forViewer(post, viewer) : null;
}

export type PreviewPost = PublicPost & { status: "draft" | "published"; isDraftPreview: boolean };

/**
 * 관리자 미리보기: 초안이나 공개 글의 미공개 수정본을 공개 화면 모양으로 본다. 캐시하지 않는다.
 * 관리자가 아니면 null(→ 404).
 */
export async function getPreviewPost(
  menuId: string,
  slug: string,
  viewer: Viewer,
): Promise<PreviewPost | null> {
  if (!viewer.isAdmin) return null;
  const { data } = await createAdminClient()
    .from("posts")
    .select(
      `${SUMMARY_COLUMNS}, menu_id, status, content, content_text, draft_title, draft_content, updated_at`,
    )
    .eq("menu_id", menuId)
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  const hasDraft = data.draft_content !== null || data.draft_title !== null;
  if (data.status === "published" && !hasDraft) return null; // 미리볼 것이 없다
  return {
    ...toSummary(data),
    title: data.draft_title ?? data.title,
    menuId: data.menu_id!,
    content: ((hasDraft ? (data.draft_content ?? data.content) : data.content) ??
      []) as unknown as Block[],
    contentText: data.content_text,
    updatedAt: data.updated_at,
    status: data.status === "published" ? "published" : "draft",
    isDraftPreview: true,
  };
}

export type RecentPost = PublicPostSummary & { menuId: string };

/**
 * 최근 공개 글(홈 F-11). 메뉴 종류(게시글·게시판)와 활성 여부는 호출하는 쪽에서 메뉴 트리로 거른다.
 * 비활성 메뉴 글이 섞여 개수가 모자라지 않게 넉넉히 가져온다.
 */
export const listRecentPublished = unstable_cache(
  async (limit: number): Promise<RecentPost[]> => {
    const { data, error } = await createAdminClient()
      .from("posts")
      .select(`${SUMMARY_COLUMNS}, menu_id`)
      .eq("status", "published")
      .is("deleted_at", null)
      .is("hidden_at", null)
      .not("menu_id", "is", null)
      .order("published_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(`최근 게시물 조회 실패: ${error.message}`);
    return data.map((row) => ({ ...toSummary(row), menuId: row.menu_id! }));
  },
  ["recent-published-posts"],
  { tags: [POSTS_CACHE_TAG], revalidate: 3600 },
);
