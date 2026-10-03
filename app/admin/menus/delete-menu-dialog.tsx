"use client";

import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { MenuNode } from "@/lib/menus/tree";

import { deleteMenu, type DeleteMenuPostAction } from "./actions";

/** 게시물이 있는 메뉴 삭제: "다른 메뉴로 옮긴 뒤 삭제" 또는 "함께 휴지통으로"(F-04) */
export function DeleteMenuDialog({
  target,
  menus,
  onClose,
  onDone,
}: {
  target: { menu: MenuNode; postCount: number } | null;
  menus: MenuNode[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [mode, setMode] = useState<"move" | "trash">("move");
  const [targetMenuId, setTargetMenuId] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const uid = useId();

  const candidates = menus.filter(
    (m) => m.id !== target?.menu.id && (m.type === "series" || m.type === "board"),
  );
  const selected = candidates.find((m) => m.id === targetMenuId);
  const typeChanges = mode === "move" && selected && selected.type !== target?.menu.type;

  function submit() {
    if (!target) return;
    if (mode === "move" && !targetMenuId) return setError("옮길 메뉴를 골라 주세요.");
    const action: DeleteMenuPostAction =
      mode === "move" ? { mode: "move", targetMenuId } : { mode: "trash" };
    startTransition(async () => {
      const result = await deleteMenu(target.menu.id, action);
      if (!result.ok) return setError(result.message ?? "삭제하지 못했습니다.");
      setError("");
      setTargetMenuId("");
      onDone(result.message ?? "삭제했습니다.");
    });
  }

  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>&apos;{target?.menu.title}&apos; 메뉴 삭제</SheetTitle>
          <SheetDescription>
            이 메뉴에 게시물이 {target?.postCount}개 있습니다. 게시물을 어떻게 할지 골라 주세요.
          </SheetDescription>
        </SheetHeader>
        <fieldset className="flex flex-col gap-3 px-4">
          <legend className="sr-only">게시물 처리 방법</legend>
          <label className="flex items-start gap-2 rounded-lg border p-3">
            <input
              type="radio"
              name={`${uid}-mode`}
              className="mt-1 size-4"
              checked={mode === "move"}
              onChange={() => setMode("move")}
            />
            <span className="flex flex-1 flex-col gap-2">
              <span className="font-medium">다른 메뉴로 옮긴 뒤 삭제</span>
              <select
                aria-label="옮길 메뉴"
                className="h-10 w-full rounded-lg border bg-background px-2 text-base md:text-sm"
                value={targetMenuId}
                disabled={mode !== "move"}
                onChange={(e) => setTargetMenuId(e.target.value)}
              >
                <option value="">메뉴 고르기</option>
                {candidates.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title} ({m.type === "board" ? "게시판" : "게시글"})
                  </option>
                ))}
              </select>
            </span>
          </label>
          <label className="flex items-start gap-2 rounded-lg border p-3">
            <input
              type="radio"
              name={`${uid}-mode`}
              className="mt-1 size-4"
              checked={mode === "trash"}
              onChange={() => setMode("trash")}
            />
            <span className="flex flex-col">
              <span className="font-medium">함께 휴지통으로</span>
              <span className="text-sm text-muted-foreground">
                30일 안에 복구할 수 있습니다. 복구할 때 넣을 메뉴를 다시 고릅니다.
              </span>
            </span>
          </label>
          {typeChanges && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              게시글(차시형 문서)과 게시판은 보이는 형식이 다릅니다. 옮긴 뒤 내용을 확인해 주세요.
            </p>
          )}
          <p role="alert" className="text-sm text-destructive empty:hidden">
            {error}
          </p>
          <div className="flex gap-2 pb-4">
            <Button variant="destructive" className="h-10" disabled={pending} onClick={submit}>
              {mode === "move" ? "옮기고 메뉴 삭제" : "휴지통으로 보내고 메뉴 삭제"}
            </Button>
            <Button variant="ghost" className="h-10" onClick={onClose}>
              취소
            </Button>
          </div>
        </fieldset>
      </SheetContent>
    </Sheet>
  );
}
