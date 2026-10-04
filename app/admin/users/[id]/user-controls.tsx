"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { roleLabels, USER_ROLES, type UserRole } from "@/lib/auth/roles";

import {
  forceWithdrawUser,
  reviewTeachers,
  setUserRole,
  setUserStatus,
  type UserActionResult,
} from "../actions";
import { ActionStatus } from "../user-action-buttons";

function useRun() {
  const router = useRouter();
  const [result, setResult] = useState<UserActionResult | null>(null);
  const [pending, start] = useTransition();
  const run = (task: () => Promise<UserActionResult>) =>
    start(async () => {
      const r = await task();
      setResult(r);
      if (r.ok) router.refresh();
    });
  return { result, pending, run };
}

/** 등급 변경. 만 14세 미만은 학생만(DB도 막는다). */
export function RoleControl({
  userId,
  role,
  isUnder14,
  disabled,
}: {
  userId: string;
  role: UserRole;
  isUnder14: boolean;
  disabled: boolean;
}) {
  const [value, setValue] = useState<UserRole>(role);
  const { result, pending, run } = useRun();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          등급
          <select
            value={value}
            onChange={(e) => setValue(e.target.value as UserRole)}
            disabled={disabled}
            className="h-9 rounded-lg border bg-background px-2 text-sm"
          >
            {USER_ROLES.map((r) => (
              <option key={r} value={r} disabled={isUnder14 && r !== "student"}>
                {roleLabels[r]}
              </option>
            ))}
          </select>
        </label>
        <Button
          disabled={disabled || pending || value === role}
          onClick={() => run(() => setUserRole({ userId, role: value }))}
        >
          등급 저장
        </Button>
      </div>
      {isUnder14 && (
        <p className="text-xs text-muted-foreground">만 14세 미만 회원은 학생 등급만 가능합니다.</p>
      )}
      <ActionStatus result={result} />
    </div>
  );
}

/** 이용 정지·해제 */
export function StatusControl({
  userId,
  status,
  disabled,
}: {
  userId: string;
  status: string;
  disabled: boolean;
}) {
  const { result, pending, run } = useRun();
  const suspended = status === "suspended";
  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          variant={suspended ? "outline" : "destructive"}
          disabled={disabled || pending}
          onClick={() => {
            if (!suspended && !window.confirm("이용을 정지할까요? 읽기만 할 수 있게 됩니다."))
              return;
            run(() => setUserStatus({ userId, status: suspended ? "active" : "suspended" }));
          }}
        >
          {suspended ? "정지 해제" : "이용 정지"}
        </Button>
      </div>
      <ActionStatus result={result} />
    </div>
  );
}

/** 교사 신청 승인·반려(한 명) */
export function TeacherReviewControl({ userId }: { userId: string }) {
  const [reason, setReason] = useState("");
  const { result, pending, run } = useRun();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending}
          onClick={() => run(() => reviewTeachers({ ids: [userId], approve: true }))}
        >
          승인
        </Button>
      </div>
      <Label htmlFor="single-reject-reason">반려 사유</Label>
      <div className="flex flex-wrap gap-2">
        <Input
          id="single-reject-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={300}
          className="min-w-0 flex-1"
        />
        <Button
          variant="outline"
          disabled={pending || !reason.trim()}
          onClick={() => run(() => reviewTeachers({ ids: [userId], approve: false, reason }))}
        >
          반려
        </Button>
      </div>
      <ActionStatus result={result} />
    </div>
  );
}

/** 강제 탈퇴: 닉네임을 그대로 입력해야 실행 */
export function WithdrawControl({
  userId,
  nickname,
  disabled,
}: {
  userId: string;
  nickname: string;
  disabled: boolean;
}) {
  const [confirm, setConfirm] = useState("");
  const [result, setResult] = useState<UserActionResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setResult(await forceWithdrawUser({ userId, confirm })));
      }}
    >
      <Label htmlFor="withdraw-confirm">
        확인을 위해 닉네임 <strong>{nickname}</strong>을 입력하세요
      </Label>
      <div className="flex flex-wrap gap-2">
        <Input
          id="withdraw-confirm"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={disabled}
          autoComplete="off"
          className="min-w-0 flex-1"
        />
        <Button
          type="submit"
          variant="destructive"
          disabled={disabled || pending || confirm.trim() !== nickname}
        >
          강제 탈퇴
        </Button>
      </div>
      <ActionStatus result={result} />
    </form>
  );
}
