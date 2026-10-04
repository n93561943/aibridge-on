"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useId, useMemo, useState, useTransition } from "react";

import { CommentBody } from "@/components/content/comment-body";
import { Button } from "@/components/ui/button";
import {
  COMMENT_MAX_LENGTH,
  COMMENT_SORTS,
  type CommentNode,
  type CommentSort,
  commentSortLabels,
  MAX_COMMENT_DEPTH,
  sortCommentTree,
} from "@/lib/board/comment-tree";
import { formatRelativeTime } from "@/lib/board/format";
import { cn } from "@/lib/utils";

import { addComment, deleteComment, editComment } from "./board-post-actions";
import { ReportButton } from "./report-button";
import { type FeedNotice, VoteButtons } from "./vote-buttons";

type Ctx = {
  postId: string;
  canComment: boolean;
  canVote: boolean;
  allowVotes: boolean;
  isAdmin: boolean;
  loginHref: string;
  now: number;
  onNotice: (notice: FeedNotice | null) => void;
};

/** 댓글 입력칸(새 댓글·답글·수정 공용) */
function CommentForm({
  label,
  initial = "",
  submitLabel,
  autoFocus,
  onSubmit,
  onCancel,
}: {
  label: string;
  initial?: string;
  submitLabel: string;
  autoFocus?: boolean;
  onSubmit: (body: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  onCancel?: () => void;
}) {
  const id = useId();
  const [body, setBody] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const result = await onSubmit(body);
      if (!result.ok) setError(result.message);
      else if (!initial) setBody("");
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <textarea
        id={id}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={COMMENT_MAX_LENGTH}
        rows={3}
        autoFocus={autoFocus}
        placeholder="**굵게**, `코드`, ```코드 블록```, 주소는 자동으로 링크가 됩니다."
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="w-full rounded-lg border bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <p
          id={`${id}-error`}
          role="alert"
          className="mr-auto text-sm text-destructive empty:hidden"
        >
          {error}
        </p>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            취소
          </Button>
        )}
        <Button type="submit" disabled={pending || !body.trim()}>
          {pending ? "저장하는 중…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function CommentItem({ node, ctx }: { node: CommentNode; ctx: Ctx }) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mode, setMode] = useState<"view" | "reply" | "edit">("view");
  const [pending, start] = useTransition();
  const visible = node.state === "visible";
  const labelId = `comment-${node.id}`;

  function remove() {
    if (!window.confirm("이 댓글을 삭제할까요?")) return;
    start(async () => {
      const result = await deleteComment(node.id);
      if (!result.ok) ctx.onNotice({ text: result.message, tone: "error" });
      else router.refresh();
    });
  }

  const linkButton =
    "rounded px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50";

  return (
    <li className="flex flex-col gap-1" aria-labelledby={labelId}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "펼치기" : "접기"}
          className="-ml-1 rounded p-0.5 hover:bg-muted"
        >
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        <span id={labelId} className="font-semibold text-foreground">
          {visible ? node.author : node.state === "deleted" ? "삭제된 댓글" : "숨겨진 댓글"}
        </span>
        <span aria-hidden>·</span>
        <time dateTime={node.createdAt}>
          {formatRelativeTime(node.createdAt, new Date(ctx.now))}
        </time>
        {node.edited && <span>· 수정됨</span>}
      </div>

      {!collapsed && (
        <div className="ml-1.5 flex flex-col gap-1 border-l pl-3 sm:pl-4">
          {visible ? (
            mode === "edit" ? (
              <CommentForm
                label="댓글 수정"
                initial={node.body!}
                submitLabel="수정"
                autoFocus
                onCancel={() => setMode("view")}
                onSubmit={async (body) => {
                  const result = await editComment({ commentId: node.id, body });
                  if (result.ok) {
                    setMode("view");
                    router.refresh();
                  }
                  return result;
                }}
              />
            ) : (
              <CommentBody body={node.body!} />
            )
          ) : (
            <p className="text-sm text-muted-foreground italic">
              {node.state === "deleted" ? "삭제된 댓글입니다." : "숨겨진 댓글입니다."}
            </p>
          )}

          {visible && mode !== "edit" && (
            <div className="-ml-1.5 flex flex-wrap items-center gap-1">
              {ctx.allowVotes && (
                <VoteButtons
                  compact
                  targetType="comment"
                  targetId={node.id}
                  score={node.score}
                  myVote={node.myVote}
                  canVote={ctx.canVote}
                  loginHref={ctx.loginHref}
                  onNotice={ctx.onNotice}
                />
              )}
              {ctx.canComment && node.depth < MAX_COMMENT_DEPTH && (
                <button
                  type="button"
                  className={linkButton}
                  onClick={() => setMode(mode === "reply" ? "view" : "reply")}
                  aria-expanded={mode === "reply"}
                >
                  답글
                </button>
              )}
              {node.isMine && (
                <button type="button" className={linkButton} onClick={() => setMode("edit")}>
                  수정
                </button>
              )}
              {!node.isMine && (
                <ReportButton
                  targetType="comment"
                  targetId={node.id}
                  canReport={ctx.canVote}
                  loginHref={ctx.loginHref}
                  onNotice={ctx.onNotice}
                  className={`${linkButton} inline-flex items-center gap-1`}
                />
              )}
              {(node.isMine || ctx.isAdmin) && (
                <button type="button" className={linkButton} onClick={remove} disabled={pending}>
                  삭제
                </button>
              )}
            </div>
          )}

          {mode === "reply" && (
            <CommentForm
              label={`${node.author}님에게 답글`}
              submitLabel="답글"
              autoFocus
              onCancel={() => setMode("view")}
              onSubmit={async (body) => {
                const result = await addComment({ postId: ctx.postId, parentId: node.id, body });
                if (result.ok) {
                  setMode("view");
                  router.refresh();
                }
                return result;
              }}
            />
          )}

          {node.children.length > 0 && (
            <ul className="mt-2 flex flex-col gap-3">
              {node.children.map((child) => (
                <CommentItem key={child.id} node={child} ctx={ctx} />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

/** 댓글 트리(F-08): 정렬(추천순·최신순), 대댓글 5단계, 추천/비추천·답글·접기 */
export function CommentSection({
  postId,
  comments,
  commentCount,
  allowComments,
  allowVotes,
  viewer,
  loginHref,
  now,
}: {
  postId: string;
  comments: CommentNode[];
  commentCount: number;
  allowComments: boolean;
  allowVotes: boolean;
  viewer: { isLoggedIn: boolean; isActive: boolean; isAdmin: boolean };
  loginHref: string;
  now: number;
}) {
  const router = useRouter();
  const [sort, setSort] = useState<CommentSort>("top");
  const [notice, setNotice] = useState<FeedNotice | null>(null);
  const sorted = useMemo(() => sortCommentTree(comments, sort), [comments, sort]);
  const canComment = allowComments && viewer.isActive;

  const ctx: Ctx = {
    postId,
    canComment,
    canVote: viewer.isActive,
    allowVotes,
    isAdmin: viewer.isAdmin,
    loginHref,
    now,
    onNotice: setNotice,
  };

  return (
    <section id="comments" aria-labelledby="comments-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="comments-heading" className="text-lg font-semibold">
          댓글 <span className="tabular-nums">{commentCount}</span>
        </h2>
        {comments.length > 1 && (
          <div role="group" aria-label="댓글 정렬" className="flex gap-1">
            {COMMENT_SORTS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSort(s)}
                aria-pressed={sort === s}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  sort === s
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {commentSortLabels[s]}
              </button>
            ))}
          </div>
        )}
      </div>

      {!allowComments ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          댓글을 쓸 수 없는 게시판입니다.
        </p>
      ) : canComment ? (
        <CommentForm
          label="댓글 쓰기"
          submitLabel="댓글"
          onSubmit={async (body) => {
            const result = await addComment({ postId, parentId: null, body });
            if (result.ok) router.refresh();
            return result;
          }}
        />
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          {viewer.isLoggedIn ? (
            "보호자 동의를 기다리거나 이용이 정지된 계정은 댓글을 쓸 수 없습니다."
          ) : (
            <>
              댓글을 쓰려면{" "}
              <Link href={loginHref} className="font-medium underline underline-offset-4">
                로그인
              </Link>
              해 주세요.
            </>
          )}
        </p>
      )}

      <p
        role="status"
        aria-live="polite"
        className="text-sm empty:hidden data-[tone=error]:text-destructive"
        data-tone={notice?.tone}
      >
        {notice?.text}
        {notice?.loginHref && (
          <>
            {" "}
            <Link href={notice.loginHref} className="font-medium underline underline-offset-4">
              로그인
            </Link>
          </>
        )}
      </p>

      {sorted.length > 0 && (
        <ul aria-label="댓글 목록" className="flex flex-col gap-4">
          {sorted.map((node) => (
            <CommentItem key={node.id} node={node} ctx={ctx} />
          ))}
        </ul>
      )}
    </section>
  );
}
