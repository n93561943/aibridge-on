"use client";

import { ChevronDownIcon } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EditorPost } from "@/lib/posts/editor";

import { type MetaState, updatePostMeta } from "../actions";

/** 메뉴·차시 번호·주소·요약. 본문과 달리 저장하면 바로 반영된다. */
export function PostMetaForm({ post, readOnly }: { post: EditorPost; readOnly: boolean }) {
  const [state, action, pending] = useActionState<MetaState, FormData>(
    updatePostMeta.bind(null, post.id),
    {},
  );
  const errors = state.errors ?? {};
  return (
    <details className="group rounded-xl border bg-background" open={post.lessonNo === null}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm">
        <span className="font-medium">게시물 정보</span>
        <span className="truncate text-muted-foreground">
          {post.menuTitle ?? "메뉴 없음"}
          {post.lessonNo !== null && ` · ${post.lessonNo}차시`}
        </span>
        <ChevronDownIcon
          className="ml-auto size-4 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <form action={action} className="grid gap-4 border-t px-4 py-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="lessonNo">차시 번호</Label>
          <Input
            id="lessonNo"
            name="lessonNo"
            inputMode="numeric"
            defaultValue={post.lessonNo ?? ""}
            placeholder="예: 3"
            disabled={readOnly}
            aria-invalid={!!errors.lessonNo || undefined}
            aria-describedby="lessonNo-error"
          />
          <p id="lessonNo-error" className="text-sm text-destructive empty:hidden">
            {errors.lessonNo}
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="slug">주소(slug)</Label>
          <Input
            id="slug"
            name="slug"
            defaultValue={post.slug}
            maxLength={50}
            autoCapitalize="none"
            spellCheck={false}
            disabled={readOnly}
            aria-invalid={!!errors.slug || undefined}
            aria-describedby="slug-error"
          />
          <p id="slug-error" className="text-sm text-destructive empty:hidden">
            {errors.slug}
          </p>
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="summary">요약(목록에 보임, 선택)</Label>
          <Input
            id="summary"
            name="summary"
            defaultValue={post.summary ?? ""}
            maxLength={300}
            disabled={readOnly}
            aria-invalid={!!errors.summary || undefined}
            aria-describedby="summary-error"
          />
          <p id="summary-error" className="text-sm text-destructive empty:hidden">
            {errors.summary}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" variant="outline" className="h-9" disabled={pending || readOnly}>
            정보 저장
          </Button>
          <p
            role="status"
            className={`text-sm empty:hidden ${state.ok ? "text-emerald-700" : "text-destructive"}`}
          >
            {state.message}
          </p>
        </div>
      </form>
    </details>
  );
}
