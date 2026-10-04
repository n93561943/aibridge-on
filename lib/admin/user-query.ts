import { z } from "zod";

/** 관리자 회원 목록(F-03) 검색·필터. 주소(?q=&role=…)에서 읽는다. 모르는 값은 "전체". */

export const USER_PAGE_SIZE = 50;

const ROLE_FILTERS = ["all", "student", "teacher", "admin"] as const;
const STATUS_FILTERS = ["all", "active", "suspended", "pending_guardian"] as const;
const TEACHER_FILTERS = ["all", "none", "pending", "approved", "rejected"] as const;
const UNDER14_FILTERS = ["all", "yes", "no"] as const;

const fallback = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values).catch(values[0]);

const querySchema = z.object({
  q: z.string().trim().max(100).catch(""),
  role: fallback(ROLE_FILTERS),
  status: fallback(STATUS_FILTERS),
  teacher: fallback(TEACHER_FILTERS),
  under14: fallback(UNDER14_FILTERS),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export type UserListQuery = z.infer<typeof querySchema>;

type Params = Record<string, string | string[] | undefined>;

export function parseUserListQuery(params: Params): UserListQuery {
  const pick = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  return querySchema.parse({
    q: pick("q") ?? "",
    role: pick("role"),
    status: pick("status"),
    teacher: pick("teacher"),
    under14: pick("under14"),
    page: pick("page"),
  });
}

/** 목록 주소. 기본값은 주소에서 뺀다. */
export function userListHref(query: Partial<UserListQuery>): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  for (const key of ["role", "status", "teacher", "under14"] as const) {
    const value = query[key];
    if (value && value !== "all") params.set(key, value);
  }
  if (query.page && query.page > 1) params.set("page", String(query.page));
  const qs = params.toString();
  return qs ? `/admin/users?${qs}` : "/admin/users";
}

/**
 * 이메일·닉네임 검색어 → PostgREST or 조건. 조건 문법 문자(쉼표·괄호·따옴표·역슬래시)는 지우고,
 * LIKE 특수 문자(%, _)는 글자 그대로 찾도록 이스케이프한다. 남는 글자가 없으면 null.
 */
export function userSearchFilter(q: string): string | null {
  const cleaned = q.replace(/[,()"\\*]/g, " ").trim();
  if (!cleaned) return null;
  const pattern = `%${cleaned.replace(/[%_]/g, (c) => `\\${c}`)}%`;
  return `email.ilike."${pattern}",nickname.ilike."${pattern}"`;
}
