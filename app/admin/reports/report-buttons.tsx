"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { resolveReport, unhideTarget } from "./actions";

function useAction() {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (task: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const result = await task();
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) router.refresh();
    });
  return { message, pending, run };
}

function Status({ message }: { message: { ok: boolean; text: string } | null }) {
  return (
    <p
      role="status"
      className={`text-sm empty:hidden ${message?.ok ? "text-emerald-700" : "text-destructive"}`}
    >
      {message?.text}
    </p>
  );
}

/** 신고 처리: 숨김 / 유지 */
export function ResolveButtons({ reportId, label }: { reportId: string; label: string }) {
  const { message, pending, run } = useAction();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="destructive"
        disabled={pending}
        aria-label={`숨김: ${label}`}
        onClick={() => {
          if (window.confirm("숨기면 사이트에서 보이지 않습니다. 숨길까요?")) {
            run(() => resolveReport({ reportId, action: "hidden" }));
          }
        }}
      >
        숨김
      </Button>
      <Button
        variant="outline"
        disabled={pending}
        aria-label={`유지: ${label}`}
        onClick={() => run(() => resolveReport({ reportId, action: "kept" }))}
      >
        유지
      </Button>
      <Status message={message} />
    </div>
  );
}

/** 숨김 해제 */
export function UnhideButton({
  targetType,
  targetId,
  label,
}: {
  targetType: "post" | "comment";
  targetId: string;
  label: string;
}) {
  const { message, pending, run } = useAction();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        aria-label={`숨김 해제: ${label}`}
        onClick={() => run(() => unhideTarget({ targetType, targetId }))}
      >
        숨김 해제
      </Button>
      <Status message={message} />
    </div>
  );
}
