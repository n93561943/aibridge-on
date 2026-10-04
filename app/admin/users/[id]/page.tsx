import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  adminDate,
  adminDateTime,
  auditActionLabels,
  statusLabels,
  teacherStatusLabels,
} from "@/lib/admin/labels";
import { getAdminUserDetail } from "@/lib/admin/users";
import { requireAdmin } from "@/lib/auth/current-user";
import { roleLabels, toUserRole } from "@/lib/auth/roles";

import { ResendGuardianButton } from "../user-action-buttons";
import { RoleControl, StatusControl, TeacherReviewControl, WithdrawControl } from "./user-controls";

export const metadata: Metadata = { title: "회원 상세" };

function logDetail(action: string, detail: Record<string, unknown>): string {
  const value = (v: unknown) =>
    String(roleLabels[v as keyof typeof roleLabels] ?? statusLabels[String(v)] ?? v);
  if ((action === "role_change" || action === "status_change") && detail.from && detail.to) {
    return `${value(detail.from)} → ${value(detail.to)}`;
  }
  if (action === "teacher_reject" && detail.reason) return `사유: ${String(detail.reason)}`;
  return "";
}

/** 회원 상세(F-03): 기본·교사 정보, 등급·상태 변경, 교사 심사, 보호자 메일, 강제 탈퇴, 관리 이력 */
export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin("/admin/users");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const detail = await getAdminUserDetail(id);
  if (!detail) notFound();
  const { user, logs } = detail;
  const isSelf = user.id === me.id;
  const role = toUserRole(user.role);
  const pendingGuardian = user.status === "pending_guardian";

  const rows: [string, React.ReactNode][] = [
    [
      "이메일",
      <span key="e" className="break-all">
        {user.email}
      </span>,
    ],
    ["이름", user.name ?? "-"],
    ["등급", roleLabels[role]],
    ["상태", statusLabels[user.status] ?? user.status],
    ["만 14세 미만", user.is_under_14 ? "예" : "아니요"],
    ["가입일", adminDate.format(new Date(user.created_at))],
    [
      "최근 로그인",
      user.last_login_at ? adminDateTime.format(new Date(user.last_login_at)) : "없음",
    ],
    ["쓴 글·댓글", `글 ${detail.postCount}개 · 댓글 ${detail.commentCount}개`],
  ];
  if (user.is_under_14) {
    rows.push([
      "보호자 이메일",
      <span key="g" className="break-all">
        {user.guardian_email}
      </span>,
    ]);
    rows.push([
      "보호자 동의",
      user.guardian_consented_at
        ? adminDateTime.format(new Date(user.guardian_consented_at))
        : "대기 중",
    ]);
  }

  return (
    <div className="container-site flex max-w-3xl flex-col gap-6 py-8">
      <p className="text-sm">
        <Link href="/admin/users" className="text-muted-foreground hover:text-foreground">
          ← 회원 목록
        </Link>
      </p>
      <h1 className="text-2xl font-bold break-all">{user.nickname}</h1>
      {isSelf && (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm">
          내 계정입니다. 자기 자신의 등급·상태는 바꿀 수 없습니다.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>기본 정보</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {user.teacher_status !== "none" && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>교사 정보</h2>
            </CardTitle>
            <CardDescription>
              {teacherStatusLabels[user.teacher_status]}
              {user.teacher_requested_at &&
                ` · 신청 ${adminDateTime.format(new Date(user.teacher_requested_at))}`}
              {user.teacher_reject_reason && ` · 반려 사유: ${user.teacher_reject_reason}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <p className="text-sm">
              {user.teacher_school} · {user.teacher_position} · {user.teacher_subject}
            </p>
            {user.teacher_status === "pending" && <TeacherReviewControl userId={user.id} />}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>관리</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          <RoleControl
            userId={user.id}
            role={role}
            isUnder14={user.is_under_14}
            disabled={isSelf}
          />
          {pendingGuardian ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm">
                보호자 동의 대기 중입니다. 가입 후 7일 안에 동의가 없으면 자동으로 삭제됩니다.
              </p>
              <ResendGuardianButton userId={user.id} label={user.nickname} />
            </div>
          ) : (
            <StatusControl userId={user.id} status={user.status} disabled={isSelf} />
          )}
          <div className="border-t pt-4">
            <h3 className="mb-2 font-semibold text-destructive">강제 탈퇴</h3>
            <p className="mb-3 text-sm text-muted-foreground">
              계정과 개인정보가 바로 삭제되고 되돌릴 수 없습니다. 쓴 글·댓글은 작성자 없이 남습니다.
            </p>
            <WithdrawControl userId={user.id} nickname={user.nickname} disabled={isSelf} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>관리 이력</h2>
          </CardTitle>
          <CardDescription>최근 20건</CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 없습니다.</p>
          ) : (
            <ul aria-label="관리 이력" className="flex flex-col gap-2 text-sm">
              {logs.map((l) => (
                <li key={l.id} className="flex flex-wrap gap-x-2">
                  <span className="font-medium">{auditActionLabels[l.action] ?? l.action}</span>
                  <span>{logDetail(l.action, l.detail)}</span>
                  <span className="text-muted-foreground">
                    {l.actor} · {adminDateTime.format(new Date(l.createdAt))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
