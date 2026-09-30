import type { Metadata } from "next";

import { siteConfig } from "@/lib/site";

export const metadata: Metadata = { title: "개인정보처리방침" };

// 정식 방침은 P8에서 작성한다. 그전까지 가입·보호자 동의 화면에서 안내하는 내용을 그대로 싣는다.
export default function PrivacyPage() {
  return (
    <div className="container-site grid max-w-2xl gap-6 py-8 sm:py-12">
      <h1 className="text-2xl font-bold">개인정보처리방침</h1>
      <p className="rounded-lg bg-muted px-4 py-3 text-sm">
        정식 방침을 준비하고 있습니다. 현재 {siteConfig.name}가 처리하는 개인정보는 아래와 같습니다.
      </p>
      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">수집 항목</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>모든 회원: 이메일, 닉네임</li>
          <li>교사 신청 회원: 소속 학교, 직급, 과목</li>
          <li>만 14세 미만 회원: 보호자(법정대리인) 이메일</li>
        </ul>
      </section>
      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">이용 목적</h2>
        <p className="text-sm">
          회원 식별·로그인, 게시판 활동 표시, 교사 자격 확인, 만 14세 미만 회원의 법정대리인 동의
          확인
        </p>
      </section>
      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">보유 기간</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>회원 탈퇴 시까지(탈퇴하면 즉시 삭제)</li>
          <li>
            만 14세 미만 회원이 가입 후 7일 안에 보호자 동의를 받지 못하면 계정과 개인정보를 자동
            삭제
          </li>
          <li>로그인만 하고 가입 정보를 입력하지 않은 계정은 7일 뒤 자동 삭제</li>
        </ul>
      </section>
    </div>
  );
}
