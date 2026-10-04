"use client";

import Link from "next/link";
import { MessageSquare } from "lucide-react";

import type { BoardPostCard } from "@/lib/board/feed";
import { formatCompact, formatRelativeTime } from "@/lib/board/format";
import { cn } from "@/lib/utils";

import { actionPillClass, type FeedNotice, ShareButton, VoteButtons } from "./vote-buttons";

export type { FeedNotice };

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
  const titleId = `post-${post.id}-title`;

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
          <VoteButtons
            targetType="post"
            targetId={post.id}
            score={post.score}
            myVote={post.myVote}
            canVote={canVote}
            loginHref={loginHref}
            onNotice={onNotice}
          />
        )}
        {allowComments && (
          <Link
            href={`${post.href}#comments`}
            className={actionPillClass}
            aria-label={`댓글 ${post.commentCount}개`}
          >
            <MessageSquare className="size-4" aria-hidden />
            <span className="tabular-nums">{formatCompact(post.commentCount)}</span>
          </Link>
        )}
        <ShareButton url={post.shareUrl} onNotice={onNotice} />
      </div>
    </article>
  );
}
