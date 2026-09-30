"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TEACHER_POSITIONS } from "@/lib/validation/signup";

import { completeSignup, type SignupState } from "./actions";

const initialState: SignupState = {};

const checkboxClass = "size-4 shrink-0 accent-primary";

export function SignupForm({ email, next }: { email: string; next: string }) {
  const [state, action, pending] = useActionState(completeSignup, initialState);
  const [ageGroup, setAgeGroup] = useState<"over14" | "under14" | null>(null);
  const [applyTeacher, setApplyTeacher] = useState(false);
  const errors = state.errors ?? {};
  const values = state.values ?? {};
  const formRef = useRef<HTMLFormElement>(null);

  // 제출 실패 시 첫 오류 항목으로 포커스를 옮긴다(스크린리더·키보드 사용자).
  useEffect(() => {
    if (!state.errors) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="grid gap-6" noValidate>
      <input type="hidden" name="next" value={next} />

      <div className="grid gap-2">
        <Label htmlFor="signup-email">이메일</Label>
        <Input id="signup-email" value={email} readOnly disabled />
      </div>

      <Field
        id="nickname"
        label="닉네임"
        error={errors.nickname}
        hint="2~20자. 한글·영문·숫자·_·- (게시판에 표시됩니다)"
      >
        <Input
          id="nickname"
          name="nickname"
          defaultValue={values.nickname}
          autoComplete="nickname"
          maxLength={20}
          required
          aria-invalid={!!errors.nickname || undefined}
          aria-describedby="nickname-hint nickname-error"
        />
      </Field>

      <fieldset className="grid gap-2" aria-describedby="ageGroup-error">
        <legend className="mb-2 text-sm font-medium">만 14세 이상인가요?</legend>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
          <RadioOption
            name="ageGroup"
            value="over14"
            aria-invalid={!!errors.ageGroup || undefined}
            checked={ageGroup === "over14"}
            onChange={() => setAgeGroup("over14")}
          >
            네, 만 14세 이상입니다
          </RadioOption>
          <RadioOption
            name="ageGroup"
            value="under14"
            aria-invalid={!!errors.ageGroup || undefined}
            checked={ageGroup === "under14"}
            onChange={() => {
              setAgeGroup("under14");
              setApplyTeacher(false);
            }}
          >
            아니요, 만 14세 미만입니다
          </RadioOption>
        </div>
        <ErrorText id="ageGroup-error" message={errors.ageGroup} />
      </fieldset>

      {ageGroup === "under14" && (
        <div className="grid gap-3 rounded-lg border bg-muted/40 p-4">
          <p className="text-sm">
            만 14세 미만은 법에 따라 <strong>보호자(법정대리인)의 동의</strong>가 필요합니다. 보호자
            이메일로 동의 요청을 보내며,{" "}
            <strong>7일 안에 동의하지 않으면 계정이 자동으로 삭제</strong>
            됩니다. 동의 전에는 자료 열람만 할 수 있습니다.
          </p>
          <Field id="guardianEmail" label="보호자 이메일" error={errors.guardianEmail}>
            <Input
              id="guardianEmail"
              name="guardianEmail"
              defaultValue={values.guardianEmail}
              type="email"
              inputMode="email"
              autoComplete="off"
              required
              aria-invalid={!!errors.guardianEmail || undefined}
              aria-describedby="guardianEmail-error"
            />
          </Field>
        </div>
      )}

      {ageGroup === "over14" && (
        <div className="grid gap-3">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="applyTeacher"
              aria-invalid={!!errors.applyTeacher || undefined}
              aria-describedby="applyTeacher-error"
              className={`${checkboxClass} mt-0.5`}
              checked={applyTeacher}
              onChange={(e) => setApplyTeacher(e.target.checked)}
            />
            <span>
              <span className="font-medium">교사로 신청합니다</span>
              <span className="block text-muted-foreground">
                관리자 승인 후 교사 기능(교사 전용 자료, AI 토론 주제 생성)을 쓸 수 있습니다. 승인
                전에는 학생 권한입니다.
              </span>
            </span>
          </label>
          <ErrorText id="applyTeacher-error" message={errors.applyTeacher} />

          {applyTeacher && (
            <div className="grid gap-4 rounded-lg border p-4">
              <Field id="teacherSchool" label="소속 학교" error={errors.teacherSchool}>
                <Input
                  id="teacherSchool"
                  name="teacherSchool"
                  defaultValue={values.teacherSchool}
                  maxLength={100}
                  autoComplete="organization"
                  aria-invalid={!!errors.teacherSchool || undefined}
                  aria-describedby="teacherSchool-error"
                />
              </Field>
              <Field id="teacherPosition" label="직급" error={errors.teacherPosition}>
                <select
                  id="teacherPosition"
                  name="teacherPosition"
                  defaultValue={values.teacherPosition ?? ""}
                  className="h-10 w-full rounded-lg border border-input bg-transparent px-3 text-base md:text-sm"
                  aria-invalid={!!errors.teacherPosition || undefined}
                  aria-describedby="teacherPosition-error"
                >
                  <option value="" disabled>
                    선택해 주세요
                  </option>
                  {TEACHER_POSITIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="teacherSubject" label="과목" error={errors.teacherSubject}>
                <Input
                  id="teacherSubject"
                  name="teacherSubject"
                  defaultValue={values.teacherSubject}
                  maxLength={50}
                  placeholder="예) 정보"
                  aria-invalid={!!errors.teacherSubject || undefined}
                  aria-describedby="teacherSubject-error"
                />
              </Field>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-2 rounded-lg border p-4 text-sm">
        <p className="font-medium">개인정보 수집·이용 동의 (필수)</p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            수집 항목: 이메일, 닉네임 / 교사 신청 시 소속 학교·직급·과목 / 만 14세 미만은 보호자
            이메일
          </li>
          <li>이용 목적: 회원 식별·로그인, 게시판 활동 표시, 교사 자격 확인, 보호자 동의 확인</li>
          <li>보유 기간: 회원 탈퇴 시까지(탈퇴하면 즉시 삭제)</li>
        </ul>
        <p className="text-muted-foreground">
          자세한 내용은{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            개인정보처리방침
          </Link>
          을 확인해 주세요.
        </p>
        <label className="mt-1 flex items-center gap-2">
          <input
            type="checkbox"
            name="privacyAgreed"
            aria-invalid={!!errors.privacyAgreed || undefined}
            defaultChecked={values.privacyAgreed === "on"}
            className={checkboxClass}
            aria-describedby="privacyAgreed-error"
          />
          <span>위 내용을 확인했으며 동의합니다.</span>
        </label>
        <ErrorText id="privacyAgreed-error" message={errors.privacyAgreed} />
      </div>

      {state.formError && (
        <p role="alert" className="text-sm text-destructive">
          {state.formError}
        </p>
      )}

      <Button type="submit" size="lg" className="h-10" disabled={pending}>
        {pending ? "저장 중…" : "가입하기"}
      </Button>
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      <ErrorText id={`${id}-error`} message={error} />
    </div>
  );
}

function ErrorText({ id, message }: { id: string; message?: string }) {
  return (
    <p id={id} aria-live="polite" className="text-sm text-destructive empty:hidden">
      {message}
    </p>
  );
}

function RadioOption({
  children,
  ...props
}: React.ComponentProps<"input"> & { children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="radio" className="size-4 shrink-0 accent-primary" {...props} />
      <span>{children}</span>
    </label>
  );
}
