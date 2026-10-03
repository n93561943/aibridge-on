"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CopyIcon, GripVerticalIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  duplicatePost,
  type ManageResult,
  movePosts,
  reorderPosts,
  trashPosts,
} from "./manage-actions";

export type PostMenuOption = { id: string; label: string; type: "series" | "board" };
export type PostRow = {
  id: string;
  title: string;
  lessonNo: number | null;
  status: "draft" | "published";
  /** 공개 글에 미공개 수정본이 있음 */
  editing: boolean;
  menuId: string | null;
};

/**
 * 게시물 목록(F-06): 여러 개 선택 → 다른 메뉴로 이동·휴지통, 복제,
 * 메뉴 하나만 고른 상태(필터 없음)에서는 차시 순서 드래그 변경.
 */
export function PostsManager({
  posts: initialPosts,
  menus,
  reorderMenuId,
}: {
  posts: PostRow[];
  menus: PostMenuOption[];
  reorderMenuId: string | null;
}) {
  const router = useRouter();
  const [posts, setPosts] = useState(initialPosts);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveTarget, setMoveTarget] = useState("");
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setPosts(initialPosts);
    setSelected((prev) => new Set([...prev].filter((id) => initialPosts.some((p) => p.id === id))));
  }, [initialPosts]);

  const menuById = new Map(menus.map((m) => [m.id, m]));
  const allSelected = posts.length > 0 && selected.size === posts.length;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function run(task: () => Promise<ManageResult>, after?: (result: ManageResult) => void) {
    startTransition(async () => {
      const result = await task();
      setNotice({ ok: result.ok, text: result.message });
      after?.(result);
      if (result.ok) router.refresh();
    });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function moveSelected() {
    const target = menuById.get(moveTarget);
    if (!target) return setNotice({ ok: false, text: "옮길 메뉴를 골라 주세요." });
    const ids = [...selected];
    // series ↔ board 사이 이동은 형식이 달라 경고한다(F-06).
    const typeChanges = ids.some((id) => {
      const from = menuById.get(posts.find((p) => p.id === id)?.menuId ?? "");
      return from && from.type !== target.type;
    });
    if (
      typeChanges &&
      !window.confirm(
        "게시글(차시형 문서)과 게시판은 보이는 형식이 다릅니다. 그래도 옮길까요? 옮긴 뒤 내용을 확인해 주세요.",
      )
    ) {
      return;
    }
    run(
      () => movePosts(ids, target.id),
      (r) => r.ok && setSelected(new Set()),
    );
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!reorderMenuId || !over || active.id === over.id) return;
    const from = posts.findIndex((p) => p.id === active.id);
    const to = posts.findIndex((p) => p.id === over.id);
    if (from < 0 || to < 0) return;
    const before = posts;
    const next = arrayMove(posts, from, to);
    setPosts(next);
    run(
      () =>
        reorderPosts(
          reorderMenuId,
          next.map((p) => p.id),
        ),
      (r) => !r.ok && setPosts(before),
    );
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

      {posts.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-background p-8 text-center text-muted-foreground">
          조건에 맞는 게시물이 없습니다.
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
                  setSelected(allSelected ? new Set() : new Set(posts.map((p) => p.id)))
                }
              />
              {selected.size ? `${selected.size}개 선택` : "전체 선택"}
            </label>
            {selected.size > 0 && (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <select
                  aria-label="옮길 메뉴"
                  value={moveTarget}
                  onChange={(e) => setMoveTarget(e.target.value)}
                  className="h-9 max-w-48 rounded-lg border bg-background px-2 text-base md:text-sm"
                >
                  <option value="">옮길 메뉴</option>
                  {menus.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <Button variant="outline" className="h-9" disabled={pending} onClick={moveSelected}>
                  이동
                </Button>
                <Button
                  variant="destructive"
                  className="h-9"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => trashPosts([...selected]),
                      (r) => r.ok && setSelected(new Set()),
                    )
                  }
                >
                  휴지통으로
                </Button>
              </div>
            )}
          </div>

          {reorderMenuId && (
            <p className="text-xs text-muted-foreground">
              손잡이(
              <GripVerticalIcon className="inline size-3" aria-hidden />
              )를 끌어 차시 순서를 바꿉니다. 키보드: 손잡이에서 스페이스바 → 화살표 → 스페이스바.
            </p>
          )}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={posts.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <ul aria-label="게시물 목록" className="flex flex-col gap-2">
                {posts.map((post) => (
                  <PostItem
                    key={post.id}
                    post={post}
                    menuLabel={post.menuId ? (menuById.get(post.menuId)?.label ?? "") : "메뉴 없음"}
                    sortable={reorderMenuId !== null}
                    checked={selected.has(post.id)}
                    disabled={pending}
                    onToggle={() => toggle(post.id)}
                    onDuplicate={() => run(() => duplicatePost(post.id))}
                    onTrash={() => run(() => trashPosts([post.id]))}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </>
      )}
    </div>
  );
}

function PostItem({
  post,
  menuLabel,
  sortable,
  checked,
  disabled,
  onToggle,
  onDuplicate,
  onTrash,
}: {
  post: PostRow;
  menuLabel: string;
  sortable: boolean;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  onDuplicate: () => void;
  onTrash: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: post.id, disabled: !sortable || disabled });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border bg-background p-2 sm:flex-nowrap",
        isDragging && "relative z-10 shadow-lg",
        checked && "border-primary/50 bg-primary/5",
      )}
    >
      {sortable && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`순서 바꾸기: ${post.title}`}
          className="flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <GripVerticalIcon className="size-4" aria-hidden />
        </button>
      )}
      <input
        type="checkbox"
        className="size-5 shrink-0"
        aria-label={`선택: ${post.title}`}
        checked={checked}
        onChange={onToggle}
      />
      <Link href={`/admin/posts/${post.id}`} className="min-w-0 flex-1 py-1 hover:underline">
        <span className="block font-medium break-keep">
          {post.lessonNo !== null && (
            <span className="mr-1 text-muted-foreground">{post.lessonNo}차시</span>
          )}
          {post.title}
        </span>
        <span className="block truncate text-xs text-muted-foreground">{menuLabel}</span>
      </Link>
      <span
        className={cn(
          "rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
          post.status === "published"
            ? "bg-emerald-100 text-emerald-900"
            : "bg-muted text-muted-foreground",
        )}
      >
        {post.status === "published" ? (post.editing ? "공개 · 수정 중" : "공개") : "초안"}
      </span>
      <div className="flex shrink-0 items-center">
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          aria-label={`복제: ${post.title}`}
          disabled={disabled}
          onClick={onDuplicate}
        >
          <CopyIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          aria-label={`휴지통으로: ${post.title}`}
          disabled={disabled}
          onClick={onTrash}
        >
          <Trash2Icon />
        </Button>
      </div>
    </li>
  );
}
