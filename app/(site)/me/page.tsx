import type { Metadata } from "next";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireMember } from "@/lib/auth/current-user";
import { roleLabels, toUserRole } from "@/lib/auth/roles";

import { NicknameForm, TeacherForm, WithdrawForm } from "./me-forms";
import { MyBoardActivity } from "./my-board";

export const metadata: Metadata = { title: "내 정보" };

const teacherStatusLabels = {
  none: "신청 안 함",
  pending: "승인 대기 중",
  approved: "승인됨",
  rejected: "반려됨",
} as const;

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "long",
  timeZone: "Asia/Seoul",
});

export default async function MePage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { id, profile, email } = await requireMember("/me");
  const { notice } = await searchParams;
  const teacherStatus = (profile.teacher_status as keyof typeof teacherStatusLabels) ?? "none";

  return (
    <div className="container-site grid max-w-2xl gap-6 py-8 sm:py-12">
      <h1 className="text-2xl font-bold">내 정보</h1>

      {notice === "teacher_pending" && (
        <Alert>
          <AlertTitle>가입이 완료되었습니다</AlertTitle>
          <AlertDescription>
            교사 신청이 접수되었습니다. 관리자 승인 후 교사 기능을 쓸 수 있으며, 그 전에는 학생
            권한으로 이용합니다.
          </AlertDescription>
        </Alert>
      )}

      {notice === "guardian_sent" && profile.status === "pending_guardian" && (
        <Alert>
          <AlertTitle>보호자에게 동의 메일을 보냈습니다</AlertTitle>
          <AlertDescription>
            보호자가 메일의 링크에서 동의하면 모든 회원 기능을 쓸 수 있습니다. 메일이 보이지 않으면
            스팸함을 확인하거나 위의 [메일 재발송]을 눌러 주세요.
          </AlertDescription>
        </Alert>
      )}

      {notice === "guardian_mail_failed" && profile.status === "pending_guardian" && (
        <Alert variant="destructive">
          <AlertTitle>보호자 동의 메일을 보내지 못했습니다</AlertTitle>
          <AlertDescription>
            가입은 완료되었습니다. 잠시 후 위의 [메일 재발송]을 눌러 다시 보내 주세요. 계속 실패하면
            사이트 운영자에게 알려 주세요.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>기본 정보</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">이메일</dt>
            <dd className="break-all">{email}</dd>
            <dt className="text-muted-foreground">등급</dt>
            <dd>{roleLabels[toUserRole(profile.role)]}</dd>
            <dt className="text-muted-foreground">가입일</dt>
            <dd>{dateFormatter.format(new Date(profile.created_at))}</dd>
            {profile.is_under_14 && (
              <>
                <dt className="text-muted-foreground">보호자 동의</dt>
                <dd>
                  {profile.guardian_consented_at
                    ? `${dateFormatter.format(new Date(profile.guardian_consented_at))} 동의 완료`
                    : "대기 중"}
                </dd>
              </>
            )}
          </dl>
          <NicknameForm nickname={profile.nickname} />
        </CardContent>
      </Card>

      {!profile.is_under_14 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>교사 정보</h2>
            </CardTitle>
            <CardDescription>
              상태:{" "}
              <strong className="text-foreground">{teacherStatusLabels[teacherStatus]}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {teacherStatus === "rejected" && (
              <Alert variant="warning">
                <AlertTitle>교사 신청이 반려되었습니다</AlertTitle>
                <AlertDescription className="text-inherit">
                  {profile.teacher_reject_reason
                    ? `사유: ${profile.teacher_reject_reason}`
                    : "정보를 확인한 뒤 다시 신청할 수 있습니다."}
                </AlertDescription>
              </Alert>
            )}
            {teacherStatus === "none" && (
              <p className="text-sm text-muted-foreground">
                교사로 신청하면 관리자 승인 후 교사 전용 자료와 AI 토론 주제 생성 기능을 쓸 수
                있습니다.
              </p>
            )}
            <TeacherForm
              defaults={{
                teacherSchool: profile.teacher_school ?? "",
                teacherPosition: profile.teacher_position ?? "",
                teacherSubject: profile.teacher_subject ?? "",
              }}
              submitLabel={
                teacherStatus === "none"
                  ? "교사 신청"
                  : teacherStatus === "rejected"
                    ? "다시 신청"
                    : "교사 정보 저장"
              }
            />
          </CardContent>
        </Card>
      )}

      <MyBoardActivity userId={id} />

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>회원 탈퇴</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <WithdrawForm />
        </CardContent>
      </Card>
    </div>
  );
}
