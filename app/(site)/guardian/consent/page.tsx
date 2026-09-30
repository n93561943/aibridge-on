import type { Metadata } from "next";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GUARDIAN_TOKEN_TTL_DAYS } from "@/lib/guardian/token";

import { ConsentForm } from "./consent-form";
import { lookupConsentToken } from "./lookup";

export const metadata: Metadata = {
  title: "보호자 동의",
  // 토큰이 담긴 주소가 외부로 새지 않게 한다.
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

const invalidMessages = {
  not_found: "올바르지 않은 링크입니다. 메일에 있는 링크를 그대로 열어 주세요.",
  expired: `링크 유효기간(${GUARDIAN_TOKEN_TTL_DAYS}일)이 지났습니다. 자녀 계정에서 동의 메일을 다시 요청해 주세요.`,
  revoked:
    "새 동의 메일이 발송되어 이 링크는 더 이상 쓸 수 없습니다. 가장 최근 메일의 링크를 열어 주세요.",
  used: "이미 동의가 완료되었습니다. 감사합니다.",
} as const;

export default async function GuardianConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; done?: string }>;
}) {
  const { token, done } = await searchParams;

  if (done) {
    return (
      <ConsentLayout
        title="동의가 완료되었습니다"
        description="이제 자녀가 모든 회원 기능을 이용할 수 있습니다."
      >
        <p className="text-sm text-muted-foreground">
          동의를 철회하거나 자녀의 개인정보 삭제를 원하시면 사이트 운영자에게 문의해 주세요.
        </p>
      </ConsentLayout>
    );
  }

  const lookup = await lookupConsentToken(token);
  if (lookup.state !== "valid") {
    return (
      <ConsentLayout title="보호자 동의" description={invalidMessages[lookup.state]}>
        <Link href="/" className="text-sm underline underline-offset-2">
          홈으로 가기
        </Link>
      </ConsentLayout>
    );
  }

  return (
    <ConsentLayout
      title="만 14세 미만 회원 가입 보호자 동의"
      description={`${lookup.nickname}(${lookup.maskedEmail}) 회원이 가입하면서 이 이메일을 보호자 연락처로 입력했습니다.`}
    >
      <div className="grid gap-6">
        <section className="grid gap-2 text-sm">
          <h2 className="font-medium">개인정보 수집·이용 안내</h2>
          <dl className="grid gap-2 rounded-lg border p-4">
            <div>
              <dt className="font-medium">수집 항목</dt>
              <dd className="text-muted-foreground">자녀의 이메일, 닉네임 / 보호자 이메일</dd>
            </div>
            <div>
              <dt className="font-medium">이용 목적</dt>
              <dd className="text-muted-foreground">
                회원 식별·로그인, 게시판 활동(댓글·추천·글쓰기) 표시, 법정대리인 동의 확인
              </dd>
            </div>
            <div>
              <dt className="font-medium">보유 기간</dt>
              <dd className="text-muted-foreground">회원 탈퇴 시까지(탈퇴하면 즉시 삭제)</dd>
            </div>
          </dl>
          <p className="text-muted-foreground">
            동의하지 않으셔도 됩니다. 동의하지 않으면 가입일로부터 {GUARDIAN_TOKEN_TTL_DAYS}일 뒤
            자녀의 계정과 개인정보가 자동으로 삭제됩니다. 자세한 내용은{" "}
            <Link href="/privacy" className="underline underline-offset-2">
              개인정보처리방침
            </Link>
            을 확인해 주세요.
          </p>
        </section>
        <ConsentForm token={token ?? ""} />
      </div>
    </ConsentLayout>
  );
}

function ConsentLayout({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="container-site flex justify-center py-10 sm:py-16">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <h1>{title}</h1>
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}
