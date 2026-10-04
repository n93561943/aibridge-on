"use client";

import Link from "next/link";
import { ArrowBigDown, ArrowBigUp, Link2, MessageSquare } from "lucide-react";
import { useState, useTransition } from "react";

import type { BoardPostCard } from "@/lib/board/feed";
import { formatCompact, formatRelativeTime, nextVote } from "@/lib/board/format";
import { cn } from "@/lib/utils";

import { votePost } from "./board-actions";

export type FeedNotice = { text: string; tone?: "error"; loginHref?: string };

const actionClass =
  "inline-flex h-8 items-center gap-1.5 rounded-full bg-muted/60 px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

/** 게시판 글 카드(F-08): 메뉴·작성자·시간 / 제목 / 미리보기·썸네일 / 투표·댓글·공유 */
export function PostCard({
  post,
  menuTitle,
  canVote,
  allowVotes,
  allowComments,
  loginHref,
  now,
  onNotice,
}: {
  post: BoardPostCard;
  menuTitle: string;
  canVote: boolean;
  allowVotes: boolean;
  allowComments: boolean;
  loginHref: string;
  now: number;
  onNotice: (notice: FeedNotice | null) => void;
}) {
  const [vote, setVote] = useState({ score: post.score, myVote: post.myVote });
  const [pending, startVote] = useTransition();
  const titleId = `post-${post.id}-title`;

  function press(pressed: 1 | -1) {
    if (!canVote) {
      onNotice({ text: "투표하려면 로그인해 주세요.", loginHref });
      return;
    }
    const before = vote;
    const value = nextVote(before.myVote, pressed);
    // 낙관적 업데이트: 화면에 먼저 반영하고 서버 결과로 맞춘다.
    setVote({ score: before.score - before.myVote + value, myVote: value });
    onNotice(null);
    startVote(async () => {
      try {
        const result = await votePost({ postId: post.id, value });
        if (result.ok) setVote({ score: result.score, myVote: result.myVote });
        else {
          setVote(before);
          onNotice({ text: result.message, tone: "error" });
        }
      } catch {
        setVote(before);
        onNotice({ text: "투표하지 못했습니다. 잠시 후 다시 시도해 주세요.", tone: "error" });
      }
    });
  }

  async function share() {
    try {
      await navigator.clipboard.writeText(post.shareUrl);
      onNotice({ text: "링크를 복사했습니다." });
    } catch {
      onNotice({ text: "링크를 복사하지 못했습니다.", tone: "error" });
    }
  }

  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        "relative flex flex-col gap-2 rounded-xl border p-4 transition-colors hover:bg-muted/30",
        post.isPinned && "border-primary/40 bg-primary/5",
      )}
    >
      <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
        {post.isPinned && (
          <span className="rounded bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground">
            공지
          </span>
        )}
        <span className="font-semibold text-foreground">{menuTitle}</span>
        <span aria-hidden>·</span>
        <span className="truncate">{post.author}</span>
        <span aria-hidden>·</span>
        <time dateTime={post.createdAt}>{formatRelativeTime(post.createdAt, new Date(now))}</time>
      </p>

      <div className="flex gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id={titleId} className="text-base font-semibold break-keep sm:text-lg">
            {/* 카드 전체를 누를 수 있게 제목 링크를 카드 위로 넓힌다(버튼은 위에 올림). */}
            <Link href={post.href} className="after:absolute after:inset-0 after:rounded-xl">
              {post.title}
            </Link>
          </h2>
          {post.preview && (
            <p className="line-clamp-2 text-sm break-all text-muted-foreground">{post.preview}</p>
          )}
        </div>
        {post.imageUrl && (
          // Storage 공개 주소의 이미지. 크기를 미리 알 수 없어 next/image 대신 img를 쓴다.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.imageUrl}
            alt=""
            loading="lazy"
            className="size-20 shrink-0 rounded-lg border object-cover sm:size-24"
          />
        )}
      </div>

      <div className="relative z-10 flex flex-wrap items-center gap-2 pt-1">
        {allowVotes && (
          <div
            role="group"
            aria-label="투표"
            className={cn(
              "inline-flex h-8 items-center rounded-full bg-muted/60 text-xs font-semibold",
              vote.myVote === 1 && "text-orange-600 dark:text-orange-400",
              vote.myVote === -1 && "text-indigo-600 dark:text-indigo-400",
            )}
          >
            <button
              type="button"
              onClick={() => press(1)}
              disabled={pending}
              aria-pressed={vote.myVote === 1}
              aria-label="추천"
              className="flex size-8 items-center justify-center rounded-full hover:bg-muted"
            >
              <ArrowBigUp className={cn("size-5", vote.myVote === 1 && "fill-current")} />
            </button>
            <span data-testid="score" className="min-w-6 text-center tabular-nums">
              <span className="sr-only">점수 </span>
              {formatCompact(vote.score)}
            </span>
            <button
              type="button"
              onClick={() => press(-1)}
              disabled={pending}
              aria-pressed={vote.myVote === -1}
              aria-label="비추천"
              className="flex size-8 items-center justify-center rounded-full hover:bg-muted"
            >
              <ArrowBigDown className={cn("size-5", vote.myVote === -1 && "fill-current")} />
            </button>
          </div>
        )}
        {allowComments && (
          <Link
            href={`${post.href}#comments`}
            className={actionClass}
            aria-label={`댓글 ${post.commentCount}개`}
          >
            <MessageSquare className="size-4" aria-hidden />
            <span className="tabular-nums">{formatCompact(post.commentCount)}</span>
          </Link>
        )}
        <button type="button" onClick={share} className={actionClass}>
          <Link2 className="size-4" aria-hidden />
          공유
        </button>
      </div>
    </article>
  );
}
