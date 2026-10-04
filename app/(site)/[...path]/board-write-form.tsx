"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useId, useState, useTransition } from "react";

import { useUnsavedChangesWarning } from "@/components/editor/use-unsaved-changes-warning";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BOARD_TITLE_MAX } from "@/lib/board/content";
import { POST_FILES_BUCKET } from "@/lib/posts/constants";
import type { Block } from "@/lib/posts/content";
import { createClient } from "@/lib/supabase/client";

import {
  confirmBoardUpload,
  createBoardPost,
  requestBoardUpload,
  updateBoardPost,
} from "./write-actions";

const BoardEditor = dynamic(() => import("@/components/editor/board-editor"), {
  ssr: false,
  loading: () => <p className="py-10 text-center text-muted-foreground">에디터를 불러오는 중…</p>,
});

/** 게시판 글쓰기·수정 폼(F-08). 임시 저장 없이 바로 게시하고, 저장 전에 떠나면 경고한다. */
export function BoardWriteForm({
  menuId,
  postId,
  initialTitle = "",
  initialContent = [],
  cancelHref,
}: {
  menuId: string;
  /** 있으면 수정, 없으면 새 글 */
  postId?: string;
  initialTitle?: string;
  initialContent?: Block[];
  cancelHref: string;
}) {
  const router = useRouter();
  const titleId = useId();
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState<Block[]>(initialContent);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<{ text: string; field?: "title" } | null>(null);
  const [saving, startSaving] = useTransition();
  useUnsavedChangesWarning(dirty && !saving);

  const uploadFile = useCallback(
    async (file: File): Promise<string> => {
      setUploading((n) => n + 1);
      try {
        const ticket = await requestBoardUpload({
          menuId,
          fileName: file.name,
          type: file.type,
          size: file.size,
        });
        if (!ticket.ok) throw new Error(ticket.message);
        const { error: uploadError } = await createClient()
          .storage.from(POST_FILES_BUCKET)
          .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: ticket.contentType });
        if (uploadError) throw new Error("이미지를 올리지 못했습니다. 잠시 후 다시 시도해 주세요.");
        const done = await confirmBoardUpload({ menuId, path: ticket.path, fileName: file.name });
        if (!done.ok) throw new Error(done.message);
        return done.url;
      } catch (e) {
        setError({ text: e instanceof Error ? e.message : "이미지를 올리지 못했습니다." });
        throw e;
      } finally {
        setUploading((n) => n - 1);
      }
    },
    [menuId],
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError({ text: "제목을 입력해 주세요.", field: "title" });
      return;
    }
    startSaving(async () => {
      const result = postId
        ? await updateBoardPost({ menuId, postId, title, content })
        : await createBoardPost({ menuId, title, content });
      if (!result.ok) {
        setError({ text: result.message, field: result.field });
        return;
      }
      setDirty(false);
      router.push(result.href);
      router.refresh();
    });
  }

  const titleError = error?.field === "title";

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor={titleId}>제목</Label>
          <span className="text-xs text-muted-foreground tabular-nums" aria-hidden>
            {title.length}/{BOARD_TITLE_MAX}
          </span>
        </div>
        <Input
          id={titleId}
          value={title}
          maxLength={BOARD_TITLE_MAX}
          required
          autoFocus={!postId}
          aria-invalid={titleError || undefined}
          aria-describedby={titleError ? `${titleId}-error` : undefined}
          onChange={(e) => {
            setTitle(e.target.value);
            setDirty(true);
          }}
          className="h-10 text-base"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium" id={`${titleId}-body`}>
          본문
        </span>
        <div
          role="group"
          aria-labelledby={`${titleId}-body`}
          className="rounded-lg border px-1 py-3 sm:px-2"
        >
          <BoardEditor
            initialContent={initialContent}
            uploadFile={uploadFile}
            onChange={(next) => {
              setContent(next);
              setDirty(true);
            }}
          />
        </div>
      </div>

      <p
        id={titleError ? `${titleId}-error` : undefined}
        role="alert"
        className="text-sm text-destructive empty:hidden"
      >
        {error?.text}
      </p>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {uploading > 0 && (
          <span role="status" className="mr-auto text-sm text-muted-foreground">
            이미지를 올리는 중…
          </span>
        )}
        <Button asChild variant="outline" size="lg">
          <Link href={cancelHref}>취소</Link>
        </Button>
        <Button type="submit" size="lg" disabled={saving || uploading > 0}>
          {saving ? "저장하는 중…" : postId ? "수정" : "게시"}
        </Button>
      </div>
    </form>
  );
}
