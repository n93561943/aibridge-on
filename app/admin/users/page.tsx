import type { Metadata } from "next";
import Link from "next/link";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminDate, adminDateTime, statusLabels, teacherStatusLabels } from "@/lib/admin/labels";
import {
  parseUserListQuery,
  USER_PAGE_SIZE,
  type UserListQuery,
  userListHref,
} from "@/lib/admin/user-query";
import { listPendingGuardians, listPendingTeachers, listUsers } from "@/lib/admin/users";
import { requireAdmin } from "@/lib/auth/current-user";
import { roleLabels, toUserRole } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

import { ResendGuardianButton, TeacherReviewList } from "./user-action-buttons";

export const metadata: Metadata = { title: "회원" };

type SearchParams = Record<string, string | string[] | undefined>;

const TABS = [
  { key: "all", label: "전체", href: "/admin/users" },
  { key: "teachers", label: "교사 승인 대기", href: "/admin/users?tab=teachers" },
  { key: "guardians", label: "보호자 동의 대기", href: "/admin/users?tab=guardians" },
] as const;

/** 회원 관리(F-03): 전체(검색·필터) / 교사 승인 대기(일괄 승인·반려) / 보호자 동의 대기(재발송) */
export default async function UsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin("/admin/users");
  const params = await searchParams;
  const tab = TABS.find((t) => t.key === params.tab)?.key ?? "all";

  return (
    <div className="container-site flex max-w-4xl flex-col gap-6 py-8">
      <h1 className="text-2xl font-bold">회원</h1>
      {params.notice === "withdrawn" && (
        <Alert>
          <AlertDescription>
            회원을 탈퇴시켰습니다. 쓴 글·댓글은 작성자 없이 남습니다.
          </AlertDescription>
        </Alert>
      )}
      <nav aria-label="회원 보기" className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium",
              tab === t.key
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "teachers" ? (
        <TeachersTab />
      ) : tab === "guardians" ? (
        <GuardiansTab />
      ) : (
        <AllTab query={parseUserListQuery(params)} />
      )}
    </div>
  );
}

function Select({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string;
  options: [string, string][];
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <select
        name={name}
        defaultValue={value}
        className="h-9 rounded-lg border bg-background px-2 text-sm text-foreground"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

async function AllTab({ query }: { query: UserListQuery }) {
  const { users, total } = await listUsers(query);
  const pages = Math.max(1, Math.ceil(total / USER_PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <form
        method="get"
        role="search"
        aria-label="회원 검색"
        className="grid grid-cols-2 gap-2 rounded-xl border bg-background p-3 sm:grid-cols-6 sm:items-end"
      >
        <label className="col-span-2 flex flex-col gap-1 text-xs text-muted-foreground">
          이메일·닉네임
          <Input name="q" defaultValue={query.q} maxLength={100} placeholder="검색어" />
        </label>
        <Select
          name="role"
          label="등급"
          value={query.role}
          options={[
            ["all", "전체"],
            ["student", "학생"],
            ["teacher", "교사"],
            ["admin", "관리자"],
          ]}
        />
        <Select
          name="status"
          label="상태"
          value={query.status}
          options={[
            ["all", "전체"],
            ["active", "활동"],
            ["suspended", "이용 정지"],
            ["pending_guardian", "동의 대기"],
          ]}
        />
        <Select
          name="teacher"
          label="교사 신청"
          value={query.teacher}
          options={[
            ["all", "전체"],
            ["none", "신청 안 함"],
            ["pending", "승인 대기"],
            ["approved", "승인됨"],
            ["rejected", "반려됨"],
          ]}
        />
        <Select
          name="under14"
          label="만 14세 미만"
          value={query.under14}
          options={[
            ["all", "전체"],
            ["yes", "예"],
            ["no", "아니요"],
          ]}
        />
        <Button type="submit" className="col-span-2 h-9 sm:col-span-6 sm:justify-self-end">
          검색
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        {total.toLocaleString()}명{pages > 1 && ` · ${query.page}/${pages}쪽`}
      </p>

      {users.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          조건에 맞는 회원이 없습니다.
        </p>
      ) : (
        <ul aria-label="회원 목록" className="flex flex-col gap-2">
          {users.map((u) => (
            <li key={u.id}>
              <Link
                href={`/admin/users/${u.id}`}
                className="grid gap-1 rounded-xl border bg-background p-3 text-sm transition-colors hover:bg-muted/50 sm:grid-cols-[1fr_auto]"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold">{u.nickname}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {roleLabels[toUserRole(u.role)]}
                    </span>
                    {u.status !== "active" && (
                      <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs text-destructive">
                        {statusLabels[u.status]}
                      </span>
                    )}
                    {u.is_under_14 && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">
                        14세 미만
                      </span>
                    )}
                    {u.teacher_status !== "none" && (
                      <span className="text-xs text-muted-foreground">
                        교사 {teacherStatusLabels[u.teacher_status]}
                        {u.teacher_school && ` · ${u.teacher_school}`}
                      </span>
                    )}
                  </span>
                  <span className="break-all text-muted-foreground">{u.email}</span>
                </span>
                <span className="text-xs text-muted-foreground sm:text-right">
                  가입 {adminDate.format(new Date(u.created_at))}
                  <br className="hidden sm:block" />
                  <span className="sm:hidden"> · </span>
                  최근 로그인{" "}
                  {u.last_login_at ? adminDateTime.format(new Date(u.last_login_at)) : "없음"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="쪽 이동" className="flex justify-center gap-2">
          {query.page > 1 && (
            <Button asChild variant="outline">
              <Link href={userListHref({ ...query, page: query.page - 1 })}>이전</Link>
            </Button>
          )}
          {query.page < pages && (
            <Button asChild variant="outline">
              <Link href={userListHref({ ...query, page: query.page + 1 })}>다음</Link>
            </Button>
          )}
        </nav>
      )}
    </div>
  );
}

async function TeachersTab() {
  const rows = await listPendingTeachers();
  return (
    <TeacherReviewList
      rows={rows.map((u) => ({
        id: u.id,
        nickname: u.nickname,
        name: u.name,
        email: u.email,
        school: u.teacher_school,
        position: u.teacher_position,
        subject: u.teacher_subject,
        requestedAt: u.teacher_requested_at
          ? adminDateTime.format(new Date(u.teacher_requested_at))
          : "-",
      }))}
    />
  );
}

async function GuardiansTab() {
  const rows = await listPendingGuardians();
  if (!rows.length) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        보호자 동의를 기다리는 회원이 없습니다.
      </p>
    );
  }
  return (
    <ul aria-label="보호자 동의 대기" className="flex flex-col gap-2">
      {rows.map((u) => (
        <li key={u.id} className="flex flex-col gap-2 rounded-xl border bg-background p-4 text-sm">
          <p className="flex flex-wrap items-center gap-1.5">
            <Link href={`/admin/users/${u.id}`} className="font-semibold hover:underline">
              {u.nickname}
            </Link>
            <span className="break-all text-muted-foreground">보호자 {u.guardian_email}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            가입 {adminDateTime.format(new Date(u.created_at))} · 마지막 발송{" "}
            {u.lastSentAt ? adminDateTime.format(new Date(u.lastSentAt)) : "없음"} ·{" "}
            <strong className="text-foreground">
              {adminDateTime.format(new Date(u.deadline))}까지 동의 없으면 자동 삭제
            </strong>
          </p>
          <ResendGuardianButton userId={u.id} label={u.nickname} />
        </li>
      ))}
    </ul>
  );
}
