"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { deletePostsForever, type ManageResult, restorePosts } from "../posts/manage-actions";

export type TrashRow = {
  id: string;
  title: string;
  lessonNo: number | null;
  /** null이면 메뉴가 삭제됨 → 복구할 메뉴를 골라야 한다 */
  menuTitle: string | null;
  daysLeft: number;
};

export function TrashManager({
  rows,
  menus,
}: {
  rows: TrashRow[];
  menus: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [restoreMenu, setRestoreMenu] = useState("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setSelected((prev) => new Set([...prev].filter((id) => rows.some((r) => r.id === id))));
  }, [rows]);

  const needsMenu = rows.some((r) => selected.has(r.id) && r.menuTitle === null);
  const allSelected = rows.length > 0 && selected.size === rows.length;

  function run(task: () => Promise<ManageResult>) {
    startTransition(async () => {
      const result = await task();
      setNotice({ ok: result.ok, text: result.message });
      if (result.ok) {
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p
        role="status"
        aria-live="polite"
        className={cn("text-sm empty:hidden", notice?.ok ? "text-emerald-700" : "text-destructive")}
      >
        {notice?.text}
      </p>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-background p-8 text-center text-muted-foreground">
          휴지통이 비어 있습니다.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-background p-2">
            <label className="flex items-center gap-2 px-1 text-sm">
              <input
                type="checkbox"
                className="size-5"
                checked={allSelected}
                onChange={() =>
                  setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))
                }
              />
              {selected.size ? `${selected.size}개 선택` : "전체 선택"}
            </label>
            {selected.size > 0 && (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {needsMenu && (
                  <select
                    aria-label="복구할 메뉴"
                    value={restoreMenu}
                    onChange={(e) => setRestoreMenu(e.target.value)}
                    className="h-9 max-w-48 rounded-lg border bg-background px-2 text-base md:text-sm"
                  >
                    <option value="">복구할 메뉴</option>
                    {menus.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                )}
                <Button
                  variant="outline"
                  className="h-9"
                  disabled={pending}
                  onClick={() => run(() => restorePosts([...selected], restoreMenu || undefined))}
                >
                  복구
                </Button>
                <Button
                  variant="destructive"
                  className="h-9"
                  disabled={pending}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `선택한 ${selected.size}개를 영구 삭제할까요? 첨부 파일도 지워지며 되돌릴 수 없습니다.`,
                      )
                    )
                      return;
                    run(() => deletePostsForever([...selected]));
                  }}
                >
                  영구 삭제
                </Button>
              </div>
            )}
          </div>
          <ul aria-label="휴지통 목록" className="flex flex-col gap-2">
            {rows.map((row) => (
              <li
                key={row.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl border bg-background p-3",
                  selected.has(row.id) && "border-primary/50 bg-primary/5",
                )}
              >
                <input
                  type="checkbox"
                  className="size-5 shrink-0"
                  aria-label={`선택: ${row.title}`}
                  checked={selected.has(row.id)}
                  onChange={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(row.id)) next.delete(row.id);
                      else next.add(row.id);
                      return next;
                    })
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-keep">
                    {row.lessonNo !== null && (
                      <span className="mr-1 text-muted-foreground">{row.lessonNo}차시</span>
                    )}
                    {row.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.menuTitle ?? "메뉴가 삭제됨(복구할 메뉴를 골라야 함)"} · {row.daysLeft}일
                    뒤 영구 삭제
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
