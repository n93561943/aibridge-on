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
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  GripVerticalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { type MenuType, menuTypeLabels } from "@/lib/menus/schema";
import { type MenuNode, menuPath, moveSibling, siblingsOf } from "@/lib/menus/tree";
import { cn } from "@/lib/utils";

import { deleteMenu, type MenuActionResult, reorderMenus, setMenuActive } from "./actions";
import { DeleteMenuDialog } from "./delete-menu-dialog";
import { MenuForm } from "./menu-form";

type FormTarget = { mode: "create"; parentId: string | null } | { mode: "edit"; menu: MenuNode };
type Notice = { ok: boolean; text: string };

export function MenuManager({ tree: initialTree }: { tree: MenuNode[] }) {
  const [tree, setTree] = useState(initialTree);
  const [formTarget, setFormTarget] = useState<FormTarget | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, startTransition] = useTransition();

  // 서버에서 새 목록이 오면(저장·재검증 후) 화면 상태를 맞춘다.
  useEffect(() => setTree(initialTree), [initialTree]);

  const groups = tree.filter((n) => n.type === "group");
  // 게시물이 있는 메뉴를 지울 때 처리 방법을 고르는 대화상자
  const [deleteTarget, setDeleteTarget] = useState<{ menu: MenuNode; postCount: number } | null>(
    null,
  );

  const requestDelete = useCallback((menu: MenuNode) => {
    startTransition(async () => {
      const result = await deleteMenu(menu.id);
      if (!result.ok && result.postCount)
        return setDeleteTarget({ menu, postCount: result.postCount });
      setNotice({ ok: result.ok, text: result.message ?? "" });
    });
  }, []);

  const run = useCallback((task: () => Promise<MenuActionResult>, rollback?: () => void) => {
    startTransition(async () => {
      const result = await task();
      if (!result.ok) rollback?.();
      setNotice({
        ok: result.ok,
        text: result.message ?? (result.ok ? "완료했습니다." : "실패했습니다."),
      });
    });
  }, []);

  const reorder = useCallback(
    (parentId: string | null, from: number, to: number) => {
      const before = tree;
      const next = moveSibling(tree, parentId, from, to);
      if (next === tree || siblingsOf(next, parentId) === siblingsOf(tree, parentId)) return;
      setTree(next);
      const ids = siblingsOf(next, parentId).map((n) => n.id);
      run(
        () => reorderMenus(parentId, ids),
        () => setTree(before),
      );
    },
    [tree, run],
  );

  const onFormDone = useCallback((message: string) => {
    setFormTarget(null);
    setNotice({ ok: true, text: message });
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button className="h-10" onClick={() => setFormTarget({ mode: "create", parentId: null })}>
          <PlusIcon />
          메뉴 추가
        </Button>
        <p className="text-xs text-muted-foreground">
          손잡이(
          <GripVerticalIcon className="inline size-3" aria-hidden />
          )를 끌거나 화살표 버튼으로 순서를 바꿉니다.
        </p>
      </div>

      <p
        role="status"
        aria-live="polite"
        className={cn(
          "text-sm empty:hidden",
          notice?.ok ? "text-emerald-700 dark:text-emerald-400" : "text-destructive",
        )}
      >
        {notice?.text}
      </p>

      {tree.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-background p-8 text-center text-muted-foreground">
          아직 메뉴가 없습니다. 메뉴 추가 버튼으로 첫 메뉴를 만드세요.
        </p>
      ) : (
        <SortableList
          items={tree}
          label="대메뉴"
          onMove={(from, to) => reorder(null, from, to)}
          renderItem={(node, index) => (
            <MenuItem
              node={node}
              parent={null}
              index={index}
              count={tree.length}
              disabled={pending}
              onMove={(to) => reorder(null, index, to)}
              onEdit={() => setFormTarget({ mode: "edit", menu: node })}
              onToggle={() => run(() => setMenuActive(node.id, !node.is_active))}
              onDelete={() => requestDelete(node)}
            >
              {node.type === "group" && (
                <div className="mt-3 flex flex-col gap-2 border-l-2 pl-3 sm:ml-6">
                  {node.children.length > 0 ? (
                    <SortableList
                      items={node.children}
                      label={`${node.title} 하위 메뉴`}
                      onMove={(from, to) => reorder(node.id, from, to)}
                      renderItem={(child, childIndex) => (
                        <MenuItem
                          node={child}
                          parent={node}
                          index={childIndex}
                          count={node.children.length}
                          disabled={pending}
                          onMove={(to) => reorder(node.id, childIndex, to)}
                          onEdit={() => setFormTarget({ mode: "edit", menu: child })}
                          onToggle={() => run(() => setMenuActive(child.id, !child.is_active))}
                          onDelete={() => requestDelete(child)}
                        />
                      )}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      하위 메뉴가 없습니다. 그룹은 하위 메뉴가 있어야 헤더에 보입니다.
                    </p>
                  )}
                  <Button
                    variant="ghost"
                    className="h-9 self-start"
                    onClick={() => setFormTarget({ mode: "create", parentId: node.id })}
                  >
                    <PlusIcon />
                    하위 메뉴 추가
                  </Button>
                </div>
              )}
            </MenuItem>
          )}
        />
      )}

      <DeleteMenuDialog
        target={deleteTarget}
        menus={tree.flatMap((n) => [n, ...n.children])}
        onClose={() => setDeleteTarget(null)}
        onDone={(message) => {
          setDeleteTarget(null);
          setNotice({ ok: true, text: message });
        }}
      />

      <Sheet open={formTarget !== null} onOpenChange={(open) => !open && setFormTarget(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{formTarget?.mode === "edit" ? "메뉴 수정" : "메뉴 추가"}</SheetTitle>
            <SheetDescription>
              {formTarget?.mode === "edit"
                ? `'${formTarget.menu.title}' 메뉴의 설정을 바꿉니다.`
                : "유형에 따라 필요한 설정이 달라집니다."}
            </SheetDescription>
          </SheetHeader>
          {formTarget && (
            <MenuForm
              key={formTarget.mode === "edit" ? formTarget.menu.id : `new-${formTarget.parentId}`}
              menu={formTarget.mode === "edit" ? formTarget.menu : undefined}
              defaultParentId={formTarget.mode === "create" ? formTarget.parentId : undefined}
              parents={groups.filter(
                (g) => formTarget.mode !== "edit" || g.id !== formTarget.menu.id,
              )}
              onDone={onFormDone}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SortableList({
  items,
  label,
  onMove,
  renderItem,
}: {
  items: MenuNode[];
  label: string;
  onMove: (from: number, to: number) => void;
  renderItem: (node: MenuNode, index: number) => React.ReactNode;
}) {
  const sensors = useSensors(
    // 살짝 움직여야 드래그가 시작되게 해서 버튼 탭과 구분한다.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((n) => n.id === active.id);
    const to = items.findIndex((n) => n.id === over.id);
    if (from >= 0 && to >= 0) onMove(from, to);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "스페이스바를 눌러 집고, 위아래 화살표로 옮긴 뒤 스페이스바로 놓습니다. Esc로 취소합니다.",
        },
        announcements: {
          onDragStart: ({ active }) => `${titleOf(items, active.id)} 메뉴를 집었습니다.`,
          onDragOver: ({ active, over }) =>
            over
              ? `${titleOf(items, active.id)} 메뉴가 ${indexOf(items, over.id)}번째 위치에 있습니다.`
              : undefined,
          onDragEnd: ({ active, over }) =>
            over
              ? `${titleOf(items, active.id)} 메뉴를 ${indexOf(items, over.id)}번째에 놓았습니다.`
              : undefined,
          onDragCancel: ({ active }) => `${titleOf(items, active.id)} 메뉴 옮기기를 취소했습니다.`,
        },
      }}
    >
      <SortableContext items={items.map((n) => n.id)} strategy={verticalListSortingStrategy}>
        <ul aria-label={label} className="flex flex-col gap-2">
          {items.map((node, index) => renderItem(node, index))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function titleOf(items: MenuNode[], id: string | number) {
  return items.find((n) => n.id === id)?.title ?? "";
}

function indexOf(items: MenuNode[], id: string | number) {
  return items.findIndex((n) => n.id === id) + 1;
}

function MenuItem({
  node,
  parent,
  index,
  count,
  disabled,
  onMove,
  onEdit,
  onToggle,
  onDelete,
  children,
}: {
  node: MenuNode;
  parent: MenuNode | null;
  index: number;
  count: number;
  disabled: boolean;
  onMove: (to: number) => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  children?: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id, disabled });
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const path = menuPath(node, parent);
  const missingUrl = node.type === "link" && !node.external_url;
  const hiddenByParent = parent !== null && !parent.is_active && node.is_active;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "rounded-xl border bg-background p-3",
        isDragging && "relative z-10 shadow-lg",
        !node.is_active && "bg-muted/50",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`순서 바꾸기: ${node.title}`}
          className="flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing disabled:cursor-not-allowed"
        >
          <GripVerticalIcon className="size-4" aria-hidden />
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn("font-medium break-keep", !node.is_active && "text-muted-foreground")}
            >
              {node.title}
            </span>
            <Badge>{menuTypeLabels[node.type as MenuType]}</Badge>
            {!node.is_active && <Badge tone="muted">비활성</Badge>}
            {missingUrl && <Badge tone="warn">주소 미입력</Badge>}
            {hiddenByParent && <Badge tone="warn">상위 메뉴 비활성</Badge>}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {node.type === "link" ? (
              node.external_url ? (
                <span className="inline-flex items-center gap-1">
                  <ExternalLinkIcon className="size-3" aria-hidden />
                  {node.external_url}
                </span>
              ) : (
                "외부 주소를 입력하면 활성화할 수 있습니다."
              )
            ) : node.type === "group" ? (
              `/${node.slug} → 첫 번째 하위 메뉴로 이동`
            ) : (
              path
            )}
          </p>
        </div>

        <div className="flex w-full items-center justify-end gap-1 sm:w-auto">
          <IconButton
            label={`위로: ${node.title}`}
            disabled={disabled || index === 0}
            onClick={() => onMove(index - 1)}
          >
            <ArrowUpIcon />
          </IconButton>
          <IconButton
            label={`아래로: ${node.title}`}
            disabled={disabled || index === count - 1}
            onClick={() => onMove(index + 1)}
          >
            <ArrowDownIcon />
          </IconButton>
          <IconButton
            label={`사이트에 보이기: ${node.title}`}
            pressed={node.is_active}
            disabled={disabled || (missingUrl && !node.is_active)}
            onClick={onToggle}
          >
            {node.is_active ? <EyeIcon /> : <EyeOffIcon />}
          </IconButton>
          <IconButton label={`수정: ${node.title}`} disabled={disabled} onClick={onEdit}>
            <PencilIcon />
          </IconButton>
          {confirmingDelete ? (
            <span className="flex items-center gap-1">
              <Button
                variant="destructive"
                className="h-9"
                disabled={disabled}
                onClick={() => {
                  setConfirmingDelete(false);
                  onDelete();
                }}
              >
                삭제
              </Button>
              <Button variant="ghost" className="h-9" onClick={() => setConfirmingDelete(false)}>
                취소
              </Button>
            </span>
          ) : (
            <IconButton
              label={`삭제: ${node.title}`}
              disabled={disabled}
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2Icon />
            </IconButton>
          )}
        </div>
      </div>
      {children}
    </li>
  );
}

function IconButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-9"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function Badge({
  tone = "default",
  children,
}: {
  tone?: "default" | "muted" | "warn";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
        tone === "default" && "bg-secondary text-secondary-foreground",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "warn" && "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
      )}
    >
      {children}
    </span>
  );
}
