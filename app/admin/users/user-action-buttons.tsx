"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

import { resendGuardianMailFor, reviewTeachers, type UserActionResult } from "./actions";

export function ActionStatus({ result }: { result: UserActionResult | null }) {
  return (
    <p
      role="status"
      className={`text-sm empty:hidden ${result?.ok ? "text-emerald-700" : "text-destructive"}`}
    >
      {result?.message}
    </p>
  );
}

export type PendingTeacherRow = {
  id: string;
  nickname: string;
  name: string | null;
  email: string;
  school: string | null;
  position: string | null;
  subject: string | null;
  requestedAt: string;
};

/** 교사 승인 대기: 골라서 승인(여러 명)·반려(사유 필수) */
export function TeacherReviewList({ rows }: { rows: PendingTeacherRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<UserActionResult | null>(null);
  const [pending, start] = useTransition();
  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function review(approve: boolean) {
    start(async () => {
      const r = await reviewTeachers({
        ids: [...selected],
        approve,
        reason: approve ? undefined : reason,
      });
      setResult(r);
      if (r.ok) {
        setSelected(new Set());
        setRejecting(false);
        setReason("");
        router.refresh();
      }
    });
  }

  // 마지막 신청을 처리해 목록이 비어도 처리 결과는 보여 준다.
  if (!rows.length) {
    return (
      <div className="flex flex-col gap-3">
        <ActionStatus result={result} />
        <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          승인을 기다리는 교사 신청이 없습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-background p-3">
        <label className="mr-auto flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
          />
          전체 선택 ({selected.size}/{rows.length})
        </label>
        <Button disabled={!selected.size || pending} onClick={() => review(true)}>
          선택 승인
        </Button>
        <Button
          variant="outline"
          disabled={!selected.size || pending}
          onClick={() => setRejecting(true)}
        >
          선택 반려
        </Button>
      </div>
      <ActionStatus result={result} />

      <ul aria-label="교사 승인 대기" className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl border bg-background p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.has(r.id)}
                onChange={() => toggle(r.id)}
                aria-label={`선택: ${r.nickname}`}
              />
              <span className="grid min-w-0 flex-1 gap-1 text-sm">
                <span className="font-semibold">
                  {r.name ? `${r.name} (${r.nickname})` : r.nickname}
                </span>
                <span className="break-all text-muted-foreground">{r.email}</span>
                <span>
                  {r.school} · {r.position} · {r.subject}
                </span>
                <span className="text-xs text-muted-foreground">신청 {r.requestedAt}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>교사 신청 반려({selected.size}명)</DialogTitle>
            <DialogDescription>
              사유는 신청자에게 메일과 내 정보 화면으로 전달됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reject-reason">반려 사유</Label>
            <textarea
              id="reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              rows={3}
              className="w-full rounded-lg border bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
            />
          </div>
          <ActionStatus result={result?.ok ? null : result} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRejecting(false)}>
              취소
            </Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || pending}
              onClick={() => review(false)}
            >
              반려하기
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** 보호자 동의 메일 재발송 */
export function ResendGuardianButton({ userId, label }: { userId: string; label: string }) {
  const [result, setResult] = useState<UserActionResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        aria-label={`메일 재발송: ${label}`}
        onClick={() => start(async () => setResult(await resendGuardianMailFor(userId)))}
      >
        {pending ? "보내는 중…" : "메일 재발송"}
      </Button>
      <ActionStatus result={result} />
    </div>
  );
}
