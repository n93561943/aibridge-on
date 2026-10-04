"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageSquare, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { formatCompact } from "@/lib/board/format";

import { setBoardPostPinned, trashBoardPost } from "./board-post-actions";
import { ReportButton } from "./report-button";
import { actionPillClass, type FeedNotice, ShareButton, VoteButtons } from "./vote-buttons";

/** 글 상세 하단: 투표·댓글 수·공유 + 작성자(수정·삭제)·관리자(고정·삭제) */
export function BoardPostActionsBar({
  menuId,
  post,
  allowVotes,
  canVote,
  isAdmin,
  loginHref,
}: {
  menuId: string;
  post: {
    id: string;
    href: string;
    shareUrl: string;
    score: number;
    myVote: number;
    commentCount: number;
    isMine: boolean;
    isPinned: boolean;
  };
  allowVotes: boolean;
  canVote: boolean;
  isAdmin: boolean;
  loginHref: string;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<FeedNotice | null>(null);
  const [pending, start] = useTransition();

  function trash() {
    if (!window.confirm("이 글을 삭제할까요? 휴지통으로 옮겨지고 30일 뒤 영구 삭제됩니다.")) return;
    start(async () => {
      const result = await trashBoardPost({ menuId, postId: post.id });
      if (!result.ok) return setNotice({ text: result.message, tone: "error" });
      router.push(result.href);
      router.refresh();
    });
  }

  function togglePin() {
    start(async () => {
      const result = await setBoardPostPinned({ menuId, postId: post.id, pinned: !post.isPinned });
      if (!result.ok) return setNotice({ text: result.message, tone: "error" });
      setNotice({ text: post.isPinned ? "고정을 풀었습니다." : "맨 위에 고정했습니다." });
      router.refresh();
    });
  }

  const manageClass = `${actionPillClass} disabled:opacity-50`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {allowVotes && (
          <VoteButtons
            targetType="post"
            targetId={post.id}
            score={post.score}
            myVote={post.myVote}
            canVote={canVote}
            loginHref={loginHref}
            onNotice={setNotice}
          />
        )}
        <a href="#comments" className={actionPillClass} aria-label={`댓글 ${post.commentCount}개`}>
          <MessageSquare className="size-4" aria-hidden />
          <span className="tabular-nums">{formatCompact(post.commentCount)}</span>
        </a>
        <ShareButton url={post.shareUrl} onNotice={setNotice} />
        {!post.isMine && (
          <ReportButton
            targetType="post"
            targetId={post.id}
            canReport={canVote}
            loginHref={loginHref}
            onNotice={setNotice}
            className={actionPillClass}
          />
        )}

        {(post.isMine || isAdmin) && (
          <div className="ml-auto flex flex-wrap gap-2">
            {post.isMine && (
              <Link href={`${post.href}/edit`} className={actionPillClass}>
                <Pencil className="size-4" aria-hidden />
                수정
              </Link>
            )}
            {isAdmin && (
              <button type="button" onClick={togglePin} disabled={pending} className={manageClass}>
                {post.isPinned ? (
                  <PinOff className="size-4" aria-hidden />
                ) : (
                  <Pin className="size-4" aria-hidden />
                )}
                {post.isPinned ? "고정 해제" : "고정"}
              </button>
            )}
            <button type="button" onClick={trash} disabled={pending} className={manageClass}>
              <Trash2 className="size-4" aria-hidden />
              삭제
            </button>
          </div>
        )}
      </div>
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
    </div>
  );
}
