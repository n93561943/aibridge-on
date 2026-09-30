"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { type ConsentState, giveGuardianConsent } from "./actions";

export function ConsentForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ConsentState, FormData>(giveGuardianConsent, {});
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="agree" className="mt-0.5 size-4 shrink-0 accent-primary" />
        <span>본인은 위 회원의 법정대리인(보호자)으로서, 위 개인정보 수집·이용에 동의합니다.</span>
      </label>
      <p role="alert" aria-live="polite" className="text-sm text-destructive empty:hidden">
        {state.error}
      </p>
      <Button type="submit" size="lg" className="h-10" disabled={pending}>
        {pending ? "처리 중…" : "동의합니다"}
      </Button>
    </form>
  );
}
