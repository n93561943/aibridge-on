"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { BoardFeedPage } from "@/lib/board/feed";
import type { FeedOrder } from "@/lib/board/format";

import { loadMoreBoardPosts } from "./board-actions";
import { type FeedNotice, PostCard } from "./post-card";

/** 카드 목록 + 무한 스크롤. 자동 불러오기와 함께 "더 보기" 버튼도 둔다(키보드·보조기기). */
export function BoardFeedList({
  menuId,
  menuTitle,
  order,
  initialPage,
  canVote,
  allowVotes,
  allowComments,
  loginHref,
  now,
}: {
  menuId: string;
  menuTitle: string;
  order: FeedOrder;
  initialPage: BoardFeedPage;
  canVote: boolean;
  allowVotes: boolean;
  allowComments: boolean;
  loginHref: string;
  now: number;
}) {
  const [posts, setPosts] = useState(initialPage.posts);
  const [cursor, setCursor] = useState(initialPage.nextCursor);
  const [failed, setFailed] = useState(false);
  const [loading, startLoading] = useTransition();
  const [notice, setNotice] = useState<FeedNotice | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);

  const loadMore = useCallback(() => {
    if (!cursor || inFlight.current) return;
    inFlight.current = true;
    setFailed(false);
    startLoading(async () => {
      try {
        const next = await loadMoreBoardPosts({
          menuId,
          sort: order.sort,
          period: order.period,
          cursor,
        });
        setPosts((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...next.posts.filter((p) => !seen.has(p.id))];
        });
        setCursor(next.nextCursor);
      } catch {
        setFailed(true);
      } finally {
        inFlight.current = false;
      }
    });
  }, [cursor, menuId, order.period, order.sort]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !cursor || failed) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [cursor, failed, loadMore]);

  if (posts.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        {order.sort === "top" && order.period !== "all"
          ? "이 기간에 올라온 글이 없습니다."
          : "아직 글이 없습니다."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
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

      <ul aria-label={`${menuTitle} 글 목록`} className="flex flex-col gap-3">
        {posts.map((post) => (
          <li key={post.id}>
            <PostCard
              post={post}
              menuTitle={menuTitle}
              canVote={canVote}
              allowVotes={allowVotes}
              allowComments={allowComments}
              loginHref={loginHref}
              now={now}
              onNotice={setNotice}
            />
          </li>
        ))}
      </ul>

      {cursor && (
        <div ref={sentinel} className="flex justify-center py-2">
          <Button variant="outline" onClick={loadMore} disabled={loading}>
            {loading ? "불러오는 중…" : failed ? "다시 불러오기" : "더 보기"}
          </Button>
        </div>
      )}
      {failed && (
        <p role="alert" className="text-center text-sm text-destructive">
          글을 더 불러오지 못했습니다.
        </p>
      )}
    </div>
  );
}
