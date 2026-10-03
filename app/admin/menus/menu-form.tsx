"use client";

import { useActionState, useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { roleLabels, USER_ROLES } from "@/lib/auth/roles";
import { MENU_TYPES, type MenuType, menuTypeLabels } from "@/lib/menus/schema";
import type { MenuNode } from "@/lib/menus/tree";

import { createMenu, type MenuFormState, updateMenu } from "./actions";

const selectClass =
  "h-10 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm dark:bg-input/30";

function ErrorText({ id, message }: { id: string; message?: string }) {
  return (
    <p id={id} aria-live="polite" className="text-sm text-destructive empty:hidden">
      {message}
    </p>
  );
}

/**
 * 메뉴 추가·수정 폼. menu가 있으면 수정.
 * parents: 상위 메뉴로 고를 수 있는 최상위 그룹 메뉴들.
 */
export function MenuForm({
  menu,
  parents,
  defaultParentId,
  onDone,
}: {
  menu?: MenuNode;
  parents: MenuNode[];
  defaultParentId?: string | null;
  onDone: (message: string) => void;
}) {
  const action = menu ? updateMenu.bind(null, menu.id) : createMenu;
  const [state, formAction, pending] = useActionState<MenuFormState, FormData>(action, {});
  const [type, setType] = useState<MenuType>((menu?.type as MenuType) ?? "series");
  const uid = useId();
  const errors = state.errors ?? {};
  // 실패 후에는 입력했던 값으로 다시 채운다.
  const values = state.values;
  const textDefault = (name: string, initial: string | null | undefined) =>
    values ? (values[name] ?? "") : (initial ?? "");
  const checkedDefault = (name: string, initial: boolean) =>
    values ? values[name] === "on" : initial;
  const fieldId = (name: string) => `${uid}-${name}`;
  const errorProps = (name: string) => ({
    "aria-invalid": !!errors[name] || undefined,
    "aria-describedby": `${fieldId(name)}-error`,
  });

  useEffect(() => {
    if (state.ok) onDone(state.message ?? "저장했습니다.");
  }, [state, onDone]);

  // 하위 메뉴가 있는 그룹은 유형·위치를 바꿀 수 없다(DB 트리거와 같은 규칙).
  const locked = menu?.type === "group" && menu.children.length > 0;

  return (
    <form action={formAction} className="flex flex-col gap-4 px-4 pb-4" noValidate>
      <div className="grid gap-2">
        <Label htmlFor={fieldId("type")}>유형</Label>
        <select
          id={fieldId("type")}
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as MenuType)}
          disabled={locked}
          className={selectClass}
          {...errorProps("type")}
        >
          {MENU_TYPES.map((t) => (
            <option key={t} value={t}>
              {menuTypeLabels[t]}
            </option>
          ))}
        </select>
        {/* disabled 값은 전송되지 않으므로 숨김 필드로 보낸다 */}
        {locked && <input type="hidden" name="type" value={type} />}
        {locked && (
          <p className="text-xs text-muted-foreground">
            하위 메뉴가 있는 그룹은 유형을 바꿀 수 없습니다.
          </p>
        )}
        <ErrorText id={`${fieldId("type")}-error`} message={errors.type} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={fieldId("title")}>제목</Label>
        <Input
          id={fieldId("title")}
          name="title"
          defaultValue={textDefault("title", menu?.title)}
          maxLength={30}
          required
          {...errorProps("title")}
        />
        <ErrorText id={`${fieldId("title")}-error`} message={errors.title} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={fieldId("slug")}>주소(slug)</Label>
        <Input
          id={fieldId("slug")}
          name="slug"
          defaultValue={textDefault("slug", menu?.slug)}
          maxLength={50}
          required
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="예: ai-literacy"
          {...errorProps("slug")}
          aria-describedby={`${fieldId("slug")}-hint ${fieldId("slug")}-error`}
        />
        <p id={`${fieldId("slug")}-hint`} className="text-xs text-muted-foreground">
          영문 소문자·숫자·하이픈(-)만 씁니다. 바꾸면 기존 주소로는 들어올 수 없습니다.
        </p>
        <ErrorText id={`${fieldId("slug")}-error`} message={errors.slug} />
      </div>

      {type !== "group" && (
        <div className="grid gap-2">
          <Label htmlFor={fieldId("parentId")}>상위 메뉴</Label>
          <select
            id={fieldId("parentId")}
            name="parentId"
            defaultValue={textDefault("parentId", menu ? menu.parent_id : defaultParentId)}
            className={selectClass}
            {...errorProps("parentId")}
          >
            <option value="">없음(대메뉴)</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <ErrorText id={`${fieldId("parentId")}-error`} message={errors.parentId} />
        </div>
      )}

      {type === "link" && (
        <div className="grid gap-2">
          <Label htmlFor={fieldId("externalUrl")}>외부 주소</Label>
          <Input
            id={fieldId("externalUrl")}
            name="externalUrl"
            type="url"
            inputMode="url"
            defaultValue={textDefault("externalUrl", menu?.external_url)}
            placeholder="https://"
            {...errorProps("externalUrl")}
          />
          <p className="text-xs text-muted-foreground">방문자가 누르면 새 탭으로 열립니다.</p>
          <ErrorText id={`${fieldId("externalUrl")}-error`} message={errors.externalUrl} />
        </div>
      )}

      {type === "board" && (
        <fieldset className="grid gap-3 rounded-lg border p-3">
          <legend className="px-1 text-sm font-medium">게시판 설정</legend>
          <div className="grid gap-2">
            <Label htmlFor={fieldId("boardWriteRole")}>글쓰기 허용 등급</Label>
            <select
              id={fieldId("boardWriteRole")}
              name="boardWriteRole"
              defaultValue={textDefault("boardWriteRole", menu?.board_write_role ?? "admin")}
              className={selectClass}
              {...errorProps("boardWriteRole")}
            >
              {[...USER_ROLES].reverse().map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]} 이상
                </option>
              ))}
            </select>
            <ErrorText id={`${fieldId("boardWriteRole")}-error`} message={errors.boardWriteRole} />
          </div>
          <CheckboxField
            name="boardAllowComments"
            label="댓글 허용"
            defaultChecked={checkedDefault(
              "boardAllowComments",
              menu?.board_allow_comments ?? true,
            )}
          />
          <CheckboxField
            name="boardAllowVotes"
            label="추천 허용"
            defaultChecked={checkedDefault("boardAllowVotes", menu?.board_allow_votes ?? true)}
          />
        </fieldset>
      )}

      <CheckboxField
        name="isActive"
        label="사이트에 보이기(활성)"
        defaultChecked={checkedDefault("isActive", menu?.is_active ?? type !== "link")}
      />

      <p role="status" aria-live="polite" className="text-sm text-destructive empty:hidden">
        {state.ok ? "" : state.message}
      </p>

      <Button type="submit" className="h-10" disabled={pending}>
        {pending ? "저장 중…" : menu ? "저장" : "메뉴 추가"}
      </Button>
    </form>
  );
}

function CheckboxField({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="size-5 accent-primary"
      />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
  );
}
