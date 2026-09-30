"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TEACHER_POSITIONS } from "@/lib/validation/signup";

import { type FormState, saveTeacherInfo, updateNickname, withdraw } from "./actions";
import { WITHDRAW_CONFIRM_TEXT } from "./constants";

function StatusMessage({ state }: { state: FormState }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className={`text-sm empty:hidden ${state.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}
    >
      {state.message}
    </p>
  );
}

function ErrorText({ id, message }: { id: string; message?: string }) {
  return (
    <p id={id} aria-live="polite" className="text-sm text-destructive empty:hidden">
      {message}
    </p>
  );
}

export function NicknameForm({ nickname }: { nickname: string }) {
  const [state, action, pending] = useActionState(updateNickname, {});
  return (
    <form action={action} className="grid gap-2">
      <Label htmlFor="nickname">닉네임</Label>
      <div className="flex gap-2">
        <Input
          id="nickname"
          name="nickname"
          defaultValue={nickname}
          maxLength={20}
          aria-invalid={!!state.errors?.nickname || undefined}
          aria-describedby="nickname-error"
        />
        <Button type="submit" variant="outline" className="h-10 shrink-0" disabled={pending}>
          저장
        </Button>
      </div>
      <ErrorText id="nickname-error" message={state.errors?.nickname} />
      <StatusMessage state={state} />
    </form>
  );
}

type TeacherDefaults = {
  teacherSchool: string;
  teacherPosition: string;
  teacherSubject: string;
};

export function TeacherForm({
  defaults,
  submitLabel,
}: {
  defaults: TeacherDefaults;
  submitLabel: string;
}) {
  const [state, action, pending] = useActionState(saveTeacherInfo, {});
  const errors = state.errors ?? {};
  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="teacherSchool">소속 학교</Label>
        <Input
          id="teacherSchool"
          name="teacherSchool"
          defaultValue={defaults.teacherSchool}
          maxLength={100}
          aria-invalid={!!errors.teacherSchool || undefined}
          aria-describedby="teacherSchool-error"
        />
        <ErrorText id="teacherSchool-error" message={errors.teacherSchool} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="teacherPosition">직급</Label>
        <select
          id="teacherPosition"
          name="teacherPosition"
          defaultValue={defaults.teacherPosition}
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
        <ErrorText id="teacherPosition-error" message={errors.teacherPosition} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="teacherSubject">과목</Label>
        <Input
          id="teacherSubject"
          name="teacherSubject"
          defaultValue={defaults.teacherSubject}
          maxLength={50}
          aria-invalid={!!errors.teacherSubject || undefined}
          aria-describedby="teacherSubject-error"
        />
        <ErrorText id="teacherSubject-error" message={errors.teacherSubject} />
      </div>
      <StatusMessage state={state} />
      <Button
        type="submit"
        variant="outline"
        className="h-10 justify-self-start"
        disabled={pending}
      >
        {submitLabel}
      </Button>
    </form>
  );
}

export function WithdrawForm() {
  const [state, action, pending] = useActionState(withdraw, {});
  return (
    <form action={action} className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        탈퇴하면 이메일·닉네임 등 개인정보가 즉시 삭제되며 되돌릴 수 없습니다. 작성한 글과 댓글은
        &ldquo;탈퇴한 회원&rdquo;으로 표시됩니다.
      </p>
      <Label htmlFor="confirm">
        확인을 위해 &ldquo;{WITHDRAW_CONFIRM_TEXT}&rdquo;를 입력해 주세요.
      </Label>
      <Input
        id="confirm"
        name="confirm"
        autoComplete="off"
        aria-invalid={!!state.errors?.confirm || undefined}
        aria-describedby="confirm-error"
      />
      <ErrorText id="confirm-error" message={state.errors?.confirm} />
      <StatusMessage state={state} />
      <Button
        type="submit"
        variant="destructive"
        className="h-10 justify-self-start"
        disabled={pending}
      >
        회원 탈퇴
      </Button>
    </form>
  );
}
