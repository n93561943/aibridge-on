"use client";

import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OTP_LENGTH, OTP_RESEND_COOLDOWN_SECONDS } from "@/lib/auth/otp-policy";

import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = { step: "email" };

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginAction, initialState);

  if (state.step === "email") {
    return (
      <form action={action} className="grid gap-4" noValidate>
        <input type="hidden" name="intent" value="send" />
        <div className="grid gap-2">
          <Label htmlFor="email">이메일</Label>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="name@example.com"
            defaultValue={state.email}
            required
            aria-invalid={!!state.error || undefined}
            aria-describedby="email-message"
          />
        </div>
        <FormMessage id="email-message" message={state.error} />
        <Button type="submit" size="lg" className="h-10" disabled={pending}>
          {pending ? "보내는 중…" : "로그인 코드 받기"}
        </Button>
        <p className="text-xs text-muted-foreground">
          비밀번호 없이 이메일로 받은 6자리 코드로 로그인합니다. 처음이면 가입 정보를 입력하는
          화면으로 이동합니다.
        </p>
      </form>
    );
  }

  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="email" value={state.email ?? ""} />
      <input type="hidden" name="next" value={next} />
      {state.notice && <p className="rounded-lg bg-muted px-3 py-2 text-sm">{state.notice}</p>}
      <div className="grid gap-2">
        <Label htmlFor="code">로그인 코드</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={OTP_LENGTH}
          placeholder="000000"
          className="h-12 text-center font-mono text-2xl tracking-[0.5em] md:text-2xl"
          autoFocus
          aria-invalid={!!state.error || undefined}
          aria-describedby="code-message"
        />
      </div>
      <FormMessage id="code-message" message={state.error} />
      <Button
        type="submit"
        name="intent"
        value="verify"
        size="lg"
        className="h-10"
        disabled={pending}
      >
        {pending ? "확인 중…" : "로그인"}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="submit"
          name="intent"
          value="reset"
          variant="link"
          className="px-0"
          disabled={pending}
        >
          이메일 다시 입력
        </Button>
        <ResendButton sentAt={state.sentAt} pending={pending} />
      </div>
    </form>
  );
}

function FormMessage({ id, message }: { id: string; message?: string }) {
  return (
    <p id={id} role="alert" aria-live="polite" className="min-h-5 text-sm text-destructive">
      {message}
    </p>
  );
}

function ResendButton({ sentAt, pending }: { sentAt?: number; pending: boolean }) {
  const remaining = useCountdown(sentAt, OTP_RESEND_COOLDOWN_SECONDS);
  return (
    <Button
      type="submit"
      name="intent"
      value="send"
      variant="outline"
      size="sm"
      disabled={pending || remaining > 0}
    >
      {remaining > 0 ? `코드 다시 받기 (${remaining}초)` : "코드 다시 받기"}
    </Button>
  );
}

function remainingSeconds(startedAt: number | undefined, seconds: number): number {
  if (!startedAt) return 0;
  return Math.max(0, seconds - Math.floor((Date.now() - startedAt) / 1000));
}

function useCountdown(startedAt: number | undefined, seconds: number): number {
  const [remaining, setRemaining] = useState(() => remainingSeconds(startedAt, seconds));

  useEffect(() => {
    setRemaining(remainingSeconds(startedAt, seconds));
    if (!startedAt) return;
    const id = window.setInterval(() => {
      const value = remainingSeconds(startedAt, seconds);
      setRemaining(value);
      if (value <= 0) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [startedAt, seconds]);

  return remaining;
}
