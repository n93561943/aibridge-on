"use client";

import { HistoryIcon } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { Block } from "@/lib/posts/content";
import type { EditorPost } from "@/lib/posts/editor";
import { createClient } from "@/lib/supabase/client";
import { POST_FILES_BUCKET } from "@/lib/posts/constants";
import { cn } from "@/lib/utils";

import {
  confirmUpload,
  discardChanges,
  publishPost,
  requestUpload,
  savePostContent,
  unpublishPost,
} from "../actions";
import { PostMetaForm } from "./post-meta-form";
import { RevisionsSheet } from "./revisions-sheet";
import { useUnsavedChangesWarning } from "./use-unsaved-changes-warning";

const PostEditor = dynamic(() => import("@/components/editor/post-editor"), {
  ssr: false,
  loading: () => <p className="py-10 text-center text-muted-foreground">에디터를 불러오는 중…</p>,
});

/** 입력이 멈춘 뒤 자동 저장까지 기다리는 시간(F-05) */
const AUTOSAVE_DELAY_MS = 3000;

type SaveState =
  | { kind: "idle" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; message: string };

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

export function EditorShell({
  post,
  judgeUrlTemplate,
  publicPath,
}: {
  post: EditorPost;
  judgeUrlTemplate: string | null;
  /** 사이트 공개 주소. 메뉴가 비활성이면 null */
  publicPath: string | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(post.editingTitle);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [hasUnpublished, setHasUnpublished] = useState(post.hasUnpublishedChanges);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [initialContent, setInitialContent] = useState<Block[]>(post.editingContent);
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [busy, startTransition] = useTransition();

  const titleRef = useRef(post.editingTitle);
  const contentRef = useRef<Block[]>(post.editingContent);
  // 변경 번호: 저장 요청 이후 또 바뀌었는지 판단한다.
  const versionRef = useRef(0);
  const savedVersionRef = useRef(0);
  const savingRef = useRef<Promise<boolean> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const readOnly = post.deletedAt !== null;
  const dirty =
    saveState.kind === "dirty" || saveState.kind === "saving" || saveState.kind === "error";
  useUnsavedChangesWarning(dirty);

  /** 지금 내용을 저장한다. 저장 중이면 끝난 뒤 이어서 저장한다. 성공 여부를 돌려준다. */
  const save = useCallback(
    async (manual = false): Promise<boolean> => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (savingRef.current) await savingRef.current;
      if (!manual && versionRef.current === savedVersionRef.current) return true;

      const version = versionRef.current;
      setSaveState({ kind: "saving" });
      const task = savePostContent(
        post.id,
        { title: titleRef.current, content: contentRef.current },
        { manual },
      ).then((result) => {
        if (!result.ok) {
          setSaveState({ kind: "error", message: result.message });
          return false;
        }
        savedVersionRef.current = version;
        setHasUnpublished(result.hasUnpublishedChanges);
        setSaveState(
          versionRef.current === version
            ? { kind: "saved", at: result.savedAt }
            : { kind: "dirty" },
        );
        return true;
      });
      savingRef.current = task.finally(() => {
        savingRef.current = null;
      });
      return task;
    },
    [post.id],
  );

  const markChanged = useCallback(() => {
    versionRef.current += 1;
    setSaveState({ kind: "dirty" });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
  }, [save]);

  // 저장 중에 또 바뀌었으면 이어서 자동 저장
  useEffect(() => {
    if (saveState.kind === "dirty" && !timerRef.current && !savingRef.current) {
      timerRef.current = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
    }
  }, [saveState, save]);

  useEffect(() => () => void (timerRef.current && clearTimeout(timerRef.current)), []);

  // Ctrl/⌘ + S: 바로 저장(이력도 남김)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!readOnly) void save(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, readOnly]);

  const onContentChange = useCallback(
    (content: Block[]) => {
      contentRef.current = content;
      markChanged();
    },
    [markChanged],
  );

  const uploadFile = useCallback(
    async (file: File): Promise<string> => {
      const ticket = await requestUpload({
        postId: post.id,
        fileName: file.name,
        type: file.type,
        size: file.size,
      });
      if (!ticket.ok) {
        setNotice({ ok: false, text: ticket.message });
        throw new Error(ticket.message);
      }
      const { error } = await createClient()
        .storage.from(POST_FILES_BUCKET)
        .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: ticket.contentType });
      if (error) {
        const text = "파일을 올리지 못했습니다. 잠시 후 다시 시도해 주세요.";
        setNotice({ ok: false, text });
        throw new Error(text);
      }
      const done = await confirmUpload({ postId: post.id, path: ticket.path, fileName: file.name });
      if (!done.ok) {
        setNotice({ ok: false, text: done.message });
        throw new Error(done.message);
      }
      return done.url;
    },
    [post.id],
  );

  /** 공개·초안 전환: 먼저 저장한 뒤 실행한다. 성공하면 미공개 수정본이 없어진다. */
  function runStatusAction(
    task: () => Promise<{ ok: boolean; message?: string }>,
    success: string,
  ) {
    startTransition(async () => {
      if (!(await save())) return;
      const result = await task();
      if (!result.ok) return setNotice({ ok: false, text: result.message ?? "실패했습니다." });
      setHasUnpublished(false);
      setNotice({ ok: true, text: success });
      router.refresh();
    });
  }

  function reloadEditor(nextTitle: string, content: Block[]) {
    titleRef.current = nextTitle;
    contentRef.current = content;
    setTitle(nextTitle);
    setInitialContent(content);
    setEditorKey((k) => k + 1);
    savedVersionRef.current = versionRef.current;
  }

  const published = post.status === "published";

  return (
    <div className="flex flex-col">
      {/* 상단 도구 막대 */}
      <div className="sticky top-(--header-height) z-30 border-b bg-background/95 backdrop-blur">
        <div className="container-site flex flex-wrap items-center gap-2 py-2">
          <Link href="/admin/posts" className="text-sm text-muted-foreground hover:text-foreground">
            ← 게시물
          </Link>
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-xs font-medium",
              published ? "bg-emerald-100 text-emerald-900" : "bg-muted text-muted-foreground",
            )}
          >
            {readOnly ? "휴지통" : published ? "공개 중" : "초안"}
          </span>
          <SaveIndicator state={saveState} onRetry={() => void save(true)} />
          <div className="ml-auto flex flex-wrap items-center gap-1">
            {publicPath && !readOnly && (
              <Button asChild variant="ghost" className="h-9">
                <a
                  href={published && !hasUnpublished ? publicPath : `${publicPath}?preview=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {published && !hasUnpublished ? "사이트에서 보기" : "미리보기"}
                </a>
              </Button>
            )}
            <Button variant="ghost" className="h-9" onClick={() => setRevisionsOpen(true)}>
              <HistoryIcon />
              이력
            </Button>
            {!readOnly && !published && (
              <Button
                className="h-9"
                disabled={busy}
                onClick={() => runStatusAction(() => publishPost(post.id), "공개했습니다.")}
              >
                공개하기
              </Button>
            )}
            {!readOnly && published && (
              <>
                <Button
                  variant="outline"
                  className="h-9"
                  disabled={busy}
                  onClick={() =>
                    runStatusAction(() => unpublishPost(post.id), "초안으로 돌렸습니다.")
                  }
                >
                  초안으로
                </Button>
                <Button
                  className="h-9"
                  disabled={busy || !hasUnpublished}
                  onClick={() =>
                    runStatusAction(
                      () => publishPost(post.id),
                      "변경 사항을 사이트에 반영했습니다.",
                    )
                  }
                >
                  변경 사항 공개
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="container-site flex max-w-4xl flex-col gap-4 py-6">
        <p
          role="status"
          aria-live="polite"
          className={cn(
            "text-sm empty:hidden",
            notice?.ok ? "text-emerald-700" : "text-destructive",
          )}
        >
          {notice?.text}
        </p>

        {readOnly && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            휴지통에 있는 게시물입니다. 복구한 뒤에 고칠 수 있습니다.
          </p>
        )}
        {published && hasUnpublished && !readOnly && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm text-sky-950">
            <p className="flex-1">
              사이트에 아직 반영하지 않은 수정 사항이 있습니다. <strong>변경 사항 공개</strong>를
              눌러야 학생에게 보입니다.
            </p>
            <Button
              variant="ghost"
              className="h-8"
              disabled={busy}
              onClick={() =>
                startTransition(async () => {
                  if (!window.confirm("수정 사항을 버리고 공개 중인 내용으로 되돌릴까요?")) return;
                  const result = await discardChanges(post.id);
                  if (!result.ok) return setNotice({ ok: false, text: result.message });
                  // 에디터를 공개본으로 다시 불러온다.
                  window.location.reload();
                })
              }
            >
              수정 취소
            </Button>
          </div>
        )}

        <label className="sr-only" htmlFor="post-title">
          제목
        </label>
        <input
          id="post-title"
          value={title}
          readOnly={readOnly}
          maxLength={200}
          onChange={(e) => {
            setTitle(e.target.value);
            titleRef.current = e.target.value;
            markChanged();
          }}
          placeholder="제목"
          className="w-full bg-transparent text-2xl font-bold outline-none placeholder:text-muted-foreground/60 sm:text-3xl"
        />

        <PostMetaForm post={post} readOnly={readOnly} />

        <div
          className={cn(
            "-mx-4 rounded-xl bg-background py-4 sm:mx-0 sm:border",
            readOnly && "pointer-events-none opacity-70",
          )}
        >
          <PostEditor
            key={editorKey}
            initialContent={initialContent}
            onChange={onContentChange}
            uploadFile={uploadFile}
            judgeUrlTemplate={judgeUrlTemplate}
          />
        </div>
      </div>

      <RevisionsSheet
        postId={post.id}
        open={revisionsOpen}
        onOpenChange={setRevisionsOpen}
        disabled={readOnly}
        beforeRestore={() => save()}
        onRestored={(restoredTitle, content) => {
          reloadEditor(restoredTitle, content);
          if (published) setHasUnpublished(true);
          setSaveState({ kind: "saved", at: new Date().toISOString() });
          setNotice({
            ok: true,
            text: published
              ? "이력을 복원했습니다. 변경 사항 공개를 눌러야 사이트에 반영됩니다."
              : "이력을 복원했습니다.",
          });
        }}
      />
    </div>
  );
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  return (
    <span role="status" aria-live="polite" className="text-xs text-muted-foreground">
      {state.kind === "dirty" && "수정 중…"}
      {state.kind === "saving" && "저장 중…"}
      {state.kind === "saved" && `저장됨 ${timeLabel(state.at)}`}
      {state.kind === "error" && (
        <span className="text-destructive">
          저장 실패: {state.message}{" "}
          <button type="button" className="underline" onClick={onRetry}>
            다시 시도
          </button>
        </span>
      )}
    </span>
  );
}
