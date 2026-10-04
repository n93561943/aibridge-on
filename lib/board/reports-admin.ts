import "server-only";

import { getAdminMenuTree } from "@/lib/menus/queries";
import { findMenuById, postPath } from "@/lib/menus/tree";
import { createClient } from "@/lib/supabase/server";

import { groupReports, type ReportGroup, type ReportRow } from "./report";

/*
 * 관리자 신고 화면(/admin/reports) 데이터. 모두 관리자 세션으로 읽는다(RLS: 관리자 전체 조회).
 * 신고자·작성자 닉네임은 관리자에게만 보인다.
 */

export type ReportTarget = {
  /** 글 제목 또는 댓글이 달린 글 제목 */
  postTitle: string;
  /** 댓글 본문 앞부분(글이면 null) */
  excerpt: string | null;
  author: string;
  /** 공개 화면 주소. 메뉴가 없거나 휴지통이면 null */
  href: string | null;
  hidden: boolean;
  deleted: boolean;
};

export type AdminReportGroup = ReportGroup & {
  target: ReportTarget | null;
  reporters: Map<string, string>;
};

export type ResolvedReportItem = {
  targetType: "post" | "comment";
  targetId: string;
  resolution: "hidden" | "kept";
  resolvedAt: string;
  resolvedBy: string;
  count: number;
  target: ReportTarget | null;
};

const REPORT_COLUMNS =
  "id, reporter_id, target_type, target_id, reason, detail, status, resolution, resolved_by, resolved_at, created_at" as const;

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function nicknames(supabase: Supabase, ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  const map = new Map<string, string>();
  for (let i = 0; i < unique.length; i += 100) {
    const { data } = await supabase
      .from("profiles")
      .select("id, nickname")
      .in("id", unique.slice(i, i + 100));
    for (const p of data ?? []) map.set(p.id, p.nickname);
  }
  return map;
}

/** 신고 대상(글·댓글)의 미리보기 정보 */
async function loadTargets(
  supabase: Supabase,
  items: { targetType: "post" | "comment"; targetId: string }[],
): Promise<Map<string, ReportTarget>> {
  const commentIds = items.filter((i) => i.targetType === "comment").map((i) => i.targetId);
  const { data: comments } = commentIds.length
    ? await supabase
        .from("comments")
        .select("id, post_id, author_id, body, hidden_at, deleted_at")
        .in("id", commentIds)
    : { data: [] };

  const postIds = [
    ...items.filter((i) => i.targetType === "post").map((i) => i.targetId),
    ...(comments ?? []).map((c) => c.post_id),
  ];
  const { data: posts } = postIds.length
    ? await supabase
        .from("posts")
        .select("id, menu_id, title, slug, author_id, hidden_at, deleted_at")
        .in("id", [...new Set(postIds)])
    : { data: [] };

  const [tree, authors] = await Promise.all([
    getAdminMenuTree(),
    nicknames(supabase, [
      ...(posts ?? []).map((p) => p.author_id),
      ...(comments ?? []).map((c) => c.author_id),
    ]),
  ]);
  const postById = new Map((posts ?? []).map((p) => [p.id, p]));
  const hrefOf = (post: NonNullable<typeof posts>[number]) => {
    if (post.deleted_at || !post.menu_id) return null;
    const found = findMenuById(tree, post.menu_id);
    return found ? postPath(found.menu, found.parent, post.slug) : null;
  };

  const targets = new Map<string, ReportTarget>();
  for (const post of posts ?? []) {
    targets.set(`post:${post.id}`, {
      postTitle: post.title,
      excerpt: null,
      author: (post.author_id && authors.get(post.author_id)) || "알 수 없음",
      href: hrefOf(post),
      hidden: !!post.hidden_at,
      deleted: !!post.deleted_at,
    });
  }
  for (const comment of comments ?? []) {
    const post = postById.get(comment.post_id);
    const postHref = post ? hrefOf(post) : null;
    targets.set(`comment:${comment.id}`, {
      postTitle: post?.title ?? "(지워진 글)",
      excerpt: comment.deleted_at ? null : comment.body.slice(0, 300),
      author: (comment.author_id && authors.get(comment.author_id)) || "알 수 없음",
      href: postHref ? `${postHref}#comments` : null,
      hidden: !!comment.hidden_at,
      deleted: !!comment.deleted_at,
    });
  }
  return targets;
}

/** 처리 대기 신고(대상별 묶음) */
export async function listOpenReportGroups(): Promise<AdminReportGroup[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reports")
    .select(REPORT_COLUMNS)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(`신고 조회 실패: ${error.message}`);
  // 한 화면에 대상 100개까지(처리하면 다음 대상이 올라온다)
  const groups = groupReports(data as ReportRow[]).slice(0, 100);
  const [targets, reporters] = await Promise.all([
    loadTargets(supabase, groups),
    nicknames(
      supabase,
      (data as ReportRow[]).map((r) => r.reporter_id),
    ),
  ]);
  return groups.map((g) => ({
    ...g,
    target: targets.get(`${g.targetType}:${g.targetId}`) ?? null,
    reporters,
  }));
}

/** 처리 완료 신고: 대상별로 가장 최근 처리 하나씩, 최근 50건 */
export async function listResolvedReports(limit = 50): Promise<ResolvedReportItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reports")
    .select(REPORT_COLUMNS)
    .eq("status", "resolved")
    .order("resolved_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`신고 조회 실패: ${error.message}`);

  const items = new Map<string, ResolvedReportItem & { resolverId: string | null }>();
  for (const r of data as ReportRow[]) {
    if (r.target_type !== "post" && r.target_type !== "comment") continue;
    const key = `${r.target_type}:${r.target_id}`;
    const existing = items.get(key);
    if (existing) {
      existing.count++;
      continue;
    }
    if (items.size >= limit) continue;
    items.set(key, {
      targetType: r.target_type,
      targetId: r.target_id,
      resolution: r.resolution === "hidden" ? "hidden" : "kept",
      resolvedAt: r.resolved_at ?? r.created_at,
      resolverId: r.resolved_by,
      resolvedBy: "",
      count: 1,
      target: null,
    });
  }
  const list = [...items.values()];
  const [targets, resolvers] = await Promise.all([
    loadTargets(supabase, list),
    nicknames(
      supabase,
      list.map((i) => i.resolverId),
    ),
  ]);
  return list.map(({ resolverId, ...item }) => ({
    ...item,
    resolvedBy: (resolverId && resolvers.get(resolverId)) || "알 수 없음",
    target: targets.get(`${item.targetType}:${item.targetId}`) ?? null,
  }));
}

/** 처리 대기 신고 대상 수(관리자 메뉴 배지) */
export async function countOpenReportTargets(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reports")
    .select("target_type, target_id")
    .eq("status", "open")
    .limit(1000);
  return new Set((data ?? []).map((r) => `${r.target_type}:${r.target_id}`)).size;
}
