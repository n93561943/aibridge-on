import "server-only";

import { GUARDIAN_TOKEN_TTL_DAYS } from "@/lib/guardian/token";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

import { USER_PAGE_SIZE, type UserListQuery, userSearchFilter } from "./user-query";

/*
 * 관리자 회원 관리(F-03) 조회. 회원 정보는 관리자 세션으로 읽는다(RLS "관리자 전체 프로필 조회").
 * 보호자 동의 발송 기록(guardian_consents)만 service role 전용 테이블이라, 호출 전에 관리자 확인을 한다.
 */

export type AdminUser = Pick<
  Tables<"profiles">,
  | "id"
  | "email"
  | "nickname"
  | "name"
  | "role"
  | "status"
  | "teacher_status"
  | "teacher_school"
  | "teacher_position"
  | "teacher_subject"
  | "teacher_requested_at"
  | "teacher_reviewed_at"
  | "teacher_reject_reason"
  | "is_under_14"
  | "guardian_email"
  | "guardian_consented_at"
  | "created_at"
  | "last_login_at"
>;

const USER_COLUMNS =
  "id, email, nickname, name, role, status, teacher_status, teacher_school, teacher_position, teacher_subject, teacher_requested_at, teacher_reviewed_at, teacher_reject_reason, is_under_14, guardian_email, guardian_consented_at, created_at, last_login_at" as const;

export async function listUsers(
  query: UserListQuery,
): Promise<{ users: AdminUser[]; total: number }> {
  const supabase = await createClient();
  let request = supabase.from("profiles").select(USER_COLUMNS, { count: "exact" });
  const search = userSearchFilter(query.q);
  if (search) request = request.or(search);
  if (query.role !== "all") request = request.eq("role", query.role);
  if (query.status !== "all") request = request.eq("status", query.status);
  if (query.teacher !== "all") request = request.eq("teacher_status", query.teacher);
  if (query.under14 !== "all") request = request.eq("is_under_14", query.under14 === "yes");
  const from = (query.page - 1) * USER_PAGE_SIZE;
  const { data, count, error } = await request
    .order("created_at", { ascending: false })
    .range(from, from + USER_PAGE_SIZE - 1);
  if (error) throw new Error(`회원 조회 실패: ${error.message}`);
  return { users: data, total: count ?? 0 };
}

/** 교사 승인 대기(신청 순) */
export async function listPendingTeachers(): Promise<AdminUser[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(USER_COLUMNS)
    .eq("teacher_status", "pending")
    .order("teacher_requested_at", { ascending: true, nullsFirst: false })
    .limit(200);
  if (error) throw new Error(`교사 신청 조회 실패: ${error.message}`);
  return data;
}

export type PendingGuardian = AdminUser & {
  /** 이 시각까지 동의가 없으면 계정이 자동 삭제된다 */
  deadline: string;
  lastSentAt: string | null;
};

/** 보호자 동의 대기(가입 순). 마지막 발송 시각은 service role로 읽는다(호출 전 관리자 확인). */
export async function listPendingGuardians(): Promise<PendingGuardian[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(USER_COLUMNS)
    .eq("status", "pending_guardian")
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(`보호자 동의 대기 조회 실패: ${error.message}`);

  const lastSent = new Map<string, string>();
  if (data.length) {
    const { data: sends } = await createAdminClient()
      .from("guardian_consents")
      .select("profile_id, created_at")
      .in(
        "profile_id",
        data.map((u) => u.id),
      )
      .order("created_at", { ascending: false });
    for (const s of sends ?? [])
      if (!lastSent.has(s.profile_id)) lastSent.set(s.profile_id, s.created_at);
  }
  const ttl = GUARDIAN_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
  return data.map((u) => ({
    ...u,
    deadline: new Date(new Date(u.created_at).getTime() + ttl).toISOString(),
    lastSentAt: lastSent.get(u.id) ?? null,
  }));
}

export type AuditLog = {
  id: number;
  action: string;
  actor: string;
  detail: Record<string, unknown>;
  createdAt: string;
};

export type AdminUserDetail = {
  user: AdminUser;
  postCount: number;
  commentCount: number;
  logs: AuditLog[];
};

export async function getAdminUserDetail(id: string): Promise<AdminUserDetail | null> {
  const supabase = await createClient();
  const { data: user } = await supabase
    .from("profiles")
    .select(USER_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (!user) return null;

  const [posts, comments, logs] = await Promise.all([
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("author_id", id),
    supabase.from("comments").select("id", { count: "exact", head: true }).eq("author_id", id),
    supabase
      .from("admin_audit_logs")
      .select("id, action, actor_id, detail, created_at")
      .eq("target_user_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const actorIds = [...new Set((logs.data ?? []).flatMap((l) => (l.actor_id ? [l.actor_id] : [])))];
  const { data: actors } = actorIds.length
    ? await supabase.from("profiles").select("id, nickname").in("id", actorIds)
    : { data: [] };
  const actorName = new Map((actors ?? []).map((a) => [a.id, a.nickname]));

  return {
    user,
    postCount: posts.count ?? 0,
    commentCount: comments.count ?? 0,
    logs: (logs.data ?? []).map((l) => ({
      id: l.id,
      action: l.action,
      actor: (l.actor_id && actorName.get(l.actor_id)) || "알 수 없음",
      detail: (l.detail ?? {}) as Record<string, unknown>,
      createdAt: l.created_at,
    })),
  };
}

export type DashboardCounts = {
  members: { total: number; student: number; teacher: number; admin: number };
  pendingTeachers: number;
  pendingGuardians: number;
  suspended: number;
};

/** 대시보드·배지용 숫자 */
export async function getDashboardCounts(): Promise<DashboardCounts> {
  const supabase = await createClient();
  const count = async (filter: (q: ReturnType<typeof base>) => ReturnType<typeof base>) =>
    (await filter(base())).count ?? 0;
  function base() {
    return supabase.from("profiles").select("id", { count: "exact", head: true });
  }
  const [total, student, teacher, admin, pendingTeachers, pendingGuardians, suspended] =
    await Promise.all([
      count((q) => q),
      count((q) => q.eq("role", "student")),
      count((q) => q.eq("role", "teacher")),
      count((q) => q.eq("role", "admin")),
      count((q) => q.eq("teacher_status", "pending")),
      count((q) => q.eq("status", "pending_guardian")),
      count((q) => q.eq("status", "suspended")),
    ]);
  return {
    members: { total, student, teacher, admin },
    pendingTeachers,
    pendingGuardians,
    suspended,
  };
}

/** 교사 승인 대기 수(헤더·관리자 메뉴 배지) */
export async function countPendingTeachers(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("teacher_status", "pending");
  return count ?? 0;
}
