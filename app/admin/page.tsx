import type { Metadata } from "next";
import Link from "next/link";

import { getDashboardCounts } from "@/lib/admin/users";
import { requireAdmin } from "@/lib/auth/current-user";
import { countOpenReportTargets } from "@/lib/board/reports-admin";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "대시보드" };

function Stat({
  label,
  value,
  href,
  alert,
  hint,
}: {
  label: string;
  value: number | string;
  href?: string;
  alert?: boolean;
  hint?: string;
}) {
  const body = (
    <>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn("text-3xl font-bold tabular-nums", alert && "text-destructive")}
        data-testid={`stat-${label}`}
      >
        {value}
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </>
  );
  const className = "flex flex-col gap-1 rounded-xl border bg-background p-4";
  return href ? (
    <Link href={href} className={cn(className, "transition-colors hover:bg-muted/50")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** 관리자 대시보드(SPEC 7장 /admin): 회원 수, 교사 승인 대기, 보호자 동의 대기, 신고, AI 비용(P7) */
export default async function AdminDashboardPage() {
  await requireAdmin("/admin");
  const [counts, openReports] = await Promise.all([getDashboardCounts(), countOpenReportTargets()]);
  const { members } = counts;

  return (
    <div className="container-site flex max-w-4xl flex-col gap-6 py-8">
      <h1 className="text-2xl font-bold">대시보드</h1>

      <section aria-labelledby="todo-heading" className="flex flex-col gap-3">
        <h2 id="todo-heading" className="font-semibold">
          처리할 일
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat
            label="교사 승인 대기"
            value={counts.pendingTeachers}
            href="/admin/users?tab=teachers"
            alert={counts.pendingTeachers > 0}
          />
          <Stat
            label="보호자 동의 대기"
            value={counts.pendingGuardians}
            href="/admin/users?tab=guardians"
            hint="7일 안에 동의가 없으면 자동 삭제"
          />
          <Stat
            label="처리 대기 신고"
            value={openReports}
            href="/admin/reports"
            alert={openReports > 0}
          />
        </div>
      </section>

      <section aria-labelledby="members-heading" className="flex flex-col gap-3">
        <h2 id="members-heading" className="font-semibold">
          회원
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="전체" value={members.total} href="/admin/users" />
          <Stat label="학생" value={members.student} href="/admin/users?role=student" />
          <Stat label="교사" value={members.teacher} href="/admin/users?role=teacher" />
          <Stat label="관리자" value={members.admin} href="/admin/users?role=admin" />
          <Stat label="이용 정지" value={counts.suspended} href="/admin/users?status=suspended" />
        </div>
      </section>

      <section aria-labelledby="ai-heading" className="flex flex-col gap-3">
        <h2 id="ai-heading" className="font-semibold">
          AI 이번 달 비용
        </h2>
        <Stat label="AI 비용" value="준비 중" hint="AI 토론 주제 기능과 함께 제공됩니다." />
      </section>
    </div>
  );
}
