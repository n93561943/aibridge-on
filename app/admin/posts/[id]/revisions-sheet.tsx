"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Block } from "@/lib/posts/content";

import { listRevisions, restoreRevision, type RevisionItem } from "../actions";

function dateLabel(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 저장 이력(최근 20개) 보기·복원 */
export function RevisionsSheet({
  postId,
  open,
  onOpenChange,
  disabled,
  beforeRestore,
  onRestored,
}: {
  postId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  disabled: boolean;
  beforeRestore: () => Promise<boolean>;
  onRestored: (title: string, content: Block[]) => void;
}) {
  const [revisions, setRevisions] = useState<RevisionItem[] | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setRevisions(null);
    setMessage("");
    listRevisions(postId).then((result) => {
      if (result.ok) setRevisions(result.revisions);
      else setMessage(result.message);
    });
  }, [open, postId]);

  function restore(revision: RevisionItem) {
    if (
      !window.confirm(
        `${dateLabel(revision.createdAt)} 이력으로 되돌릴까요? 지금 내용도 이력에 남습니다.`,
      )
    )
      return;
    startTransition(async () => {
      if (!(await beforeRestore())) return setMessage("지금 내용을 먼저 저장하지 못했습니다.");
      const result = await restoreRevision(postId, revision.id);
      if (!result.ok) return setMessage(result.message);
      onRestored(result.title, result.content);
      onOpenChange(false);
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>저장 이력</SheetTitle>
          <SheetDescription>
            직접 저장(Ctrl+S)·공개할 때와 자동 저장 10분마다 남깁니다. 최근 20개까지 보관합니다.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-2 px-4 pb-4">
          <p role="status" className="text-sm text-destructive empty:hidden">
            {message}
          </p>
          {revisions === null && !message && (
            <p className="text-sm text-muted-foreground">불러오는 중…</p>
          )}
          {revisions?.length === 0 && (
            <p className="text-sm text-muted-foreground">아직 이력이 없습니다.</p>
          )}
          <ul className="flex flex-col gap-2">
            {revisions?.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{dateLabel(r.createdAt)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.title}
                    {r.editor && ` · ${r.editor}`}
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="h-9"
                  disabled={pending || disabled}
                  onClick={() => restore(r)}
                >
                  복원
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
