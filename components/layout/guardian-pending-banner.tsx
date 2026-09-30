"use client";

import { useActionState } from "react";

import { type FormState, resendGuardianMail } from "@/app/(site)/me/actions";
import { Button } from "@/components/ui/button";

/** 만 14세 미만 회원의 보호자 동의 대기 안내(F-02). 동의 전에는 열람만 가능하다. */
export function GuardianPendingBanner() {
  const [state, action, pending] = useActionState<FormState>(resendGuardianMail, {});
  return (
    <div
      role="region"
      aria-label="보호자 동의 안내"
      className="border-b bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <div className="container-site flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p>
          <strong>보호자 동의 대기 중</strong>입니다. 보호자가 메일에서 동의하기 전에는 댓글·추천·
          글쓰기를 할 수 없습니다. 가입 후 7일 안에 동의가 없으면 계정이 삭제됩니다.
        </p>
        <form action={action} className="flex shrink-0 items-center gap-2">
          <span aria-live="polite" className="text-xs empty:hidden">
            {state.message}
          </span>
          <Button
            type="submit"
            size="sm"
            variant="outline"
            className="h-8 bg-background"
            disabled={pending}
          >
            {pending ? "보내는 중…" : "메일 재발송"}
          </Button>
        </form>
      </div>
    </div>
  );
}
