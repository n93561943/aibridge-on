"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { createPost, type CreatePostState } from "../actions";

const selectClass =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm";

export function NewPostForm({
  menus,
  defaultMenuId,
}: {
  menus: { id: string; label: string }[];
  defaultMenuId?: string;
}) {
  const [state, action, pending] = useActionState<CreatePostState, FormData>(createPost, {});
  const errors = state.errors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4 rounded-xl border bg-background p-4">
      <div className="grid gap-2">
        <Label htmlFor="menuId">메뉴</Label>
        <select
          id="menuId"
          name="menuId"
          defaultValue={defaultMenuId ?? menus[0]?.id}
          className={selectClass}
          aria-invalid={!!errors.menuId || undefined}
          aria-describedby="menuId-error"
        >
          {menus.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <p id="menuId-error" className="text-sm text-destructive empty:hidden">
          {errors.menuId}
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="title">제목</Label>
        <Input
          id="title"
          name="title"
          maxLength={200}
          required
          placeholder="예: 1차시 인공지능이란?"
          aria-invalid={!!errors.title || undefined}
          aria-describedby="title-error"
        />
        <p id="title-error" className="text-sm text-destructive empty:hidden">
          {errors.title}
        </p>
      </div>
      <p role="status" className="text-sm text-destructive empty:hidden">
        {state.message}
      </p>
      <Button type="submit" className="h-10" disabled={pending}>
        {pending ? "만드는 중…" : "초안 만들고 에디터 열기"}
      </Button>
    </form>
  );
}
