"use client";

import { Flag } from "lucide-react";
import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  REPORT_DETAIL_MAX,
  REPORT_REASONS,
  type ReportReason,
  reportReasonLabels,
} from "@/lib/board/report";
import { cn } from "@/lib/utils";

import { reportContent } from "./board-post-actions";
import type { FeedNotice } from "./vote-buttons";

/** 글·댓글 신고 버튼과 신고 창(사유 + 자세한 내용). 본인 글·댓글에는 부르지 않는다. */
export function ReportButton({
  targetType,
  targetId,
  canReport,
  loginHref,
  onNotice,
  className,
}: {
  targetType: "post" | "comment";
  targetId: string;
  /** 활동 회원인가. 아니면 창 대신 안내 */
  canReport: boolean;
  loginHref: string;
  onNotice: (notice: FeedNotice | null) => void;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const what = targetType === "post" ? "글" : "댓글";

  function openDialog() {
    if (!canReport) {
      onNotice({ text: "신고하려면 로그인해 주세요.", loginHref });
      return;
    }
    setError(null);
    setOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) return setError("신고 사유를 골라 주세요.");
    start(async () => {
      const result = await reportContent({ targetType, targetId, reason, detail });
      if (!result.ok) return setError(result.message);
      setOpen(false);
      setReason(null);
      setDetail("");
      onNotice({ text: "신고했습니다. 관리자가 확인한 뒤 처리합니다." });
    });
  }

  return (
    <>
      <button type="button" onClick={openDialog} className={className}>
        <Flag className="size-3.5" aria-hidden />
        신고
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{what} 신고</DialogTitle>
            <DialogDescription>
              관리자가 확인한 뒤 숨기거나 그대로 둡니다. 신고한 사람은 관리자만 볼 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1 text-sm font-medium">신고 사유</legend>
              {REPORT_REASONS.map((r) => (
                <label
                  key={r}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2",
                    reason === r && "border-primary bg-primary/5",
                  )}
                >
                  <input
                    type="radio"
                    name={`${id}-reason`}
                    value={r}
                    checked={reason === r}
                    onChange={() => setReason(r)}
                  />
                  {reportReasonLabels[r]}
                </label>
              ))}
            </fieldset>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-detail`} className="text-sm font-medium">
                자세한 내용(선택)
              </label>
              <textarea
                id={`${id}-detail`}
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                maxLength={REPORT_DETAIL_MAX}
                rows={3}
                className="w-full rounded-lg border bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
              />
            </div>
            <p role="alert" className="text-sm text-destructive empty:hidden">
              {error}
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                취소
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "보내는 중…" : "신고하기"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
