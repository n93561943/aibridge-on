"use client";

import { ArrowBigDown, ArrowBigUp, Link2 } from "lucide-react";
import { useState, useTransition } from "react";

import { formatCompact, nextVote } from "@/lib/board/format";
import { cn } from "@/lib/utils";

import { castVote } from "./board-actions";

/** 피드·상세·댓글이 함께 쓰는 안내 문구(role=status 영역에 보여 준다) */
export type FeedNotice = { text: string; tone?: "error"; loginHref?: string };

/**
 * 추천·점수·비추천(F-08 투표 규칙). 같은 버튼을 다시 누르면 취소, 반대 버튼이면 전환.
 * 화면에 먼저 반영(낙관적 업데이트)하고 서버 결과로 맞춘다. 실패하면 되돌린다.
 */
export function VoteButtons({
  targetType,
  targetId,
  score: initialScore,
  myVote: initialVote,
  canVote,
  loginHref,
  onNotice,
  compact = false,
}: {
  targetType: "post" | "comment";
  targetId: string;
  score: number;
  myVote: number;
  canVote: boolean;
  loginHref: string;
  onNotice: (notice: FeedNotice | null) => void;
  /** 댓글용 작은 크기 */
  compact?: boolean;
}) {
  const [vote, setVote] = useState({ score: initialScore, myVote: initialVote });
  const [pending, startVote] = useTransition();

  function press(pressed: 1 | -1) {
    if (!canVote) {
      onNotice({ text: "투표하려면 로그인해 주세요.", loginHref });
      return;
    }
    const before = vote;
    const value = nextVote(before.myVote, pressed);
    setVote({ score: before.score - before.myVote + value, myVote: value });
    onNotice(null);
    startVote(async () => {
      try {
        const result = await castVote({ targetType, targetId, value });
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

  const button = cn(
    "flex items-center justify-center rounded-full hover:bg-muted",
    compact ? "size-7" : "size-8",
  );
  const icon = compact ? "size-4" : "size-5";

  return (
    <div
      role="group"
      aria-label="투표"
      className={cn(
        "inline-flex items-center rounded-full text-xs font-semibold",
        compact ? "h-7" : "h-8 bg-muted/60",
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
        className={button}
      >
        <ArrowBigUp className={cn(icon, vote.myVote === 1 && "fill-current")} />
      </button>
      <span data-testid="score" className="min-w-5 text-center tabular-nums">
        <span className="sr-only">점수 </span>
        {formatCompact(vote.score)}
      </span>
      <button
        type="button"
        onClick={() => press(-1)}
        disabled={pending}
        aria-pressed={vote.myVote === -1}
        aria-label="비추천"
        className={button}
      >
        <ArrowBigDown className={cn(icon, vote.myVote === -1 && "fill-current")} />
      </button>
    </div>
  );
}

/** 투표 옆 둥근 버튼(댓글 수·공유 등) */
export const actionPillClass =
  "inline-flex h-8 items-center gap-1.5 rounded-full bg-muted/60 px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

/** 공유: 글 주소 복사 */
export function ShareButton({
  url,
  onNotice,
}: {
  url: string;
  onNotice: (notice: FeedNotice | null) => void;
}) {
  async function share() {
    try {
      await navigator.clipboard.writeText(url);
      onNotice({ text: "링크를 복사했습니다." });
    } catch {
      onNotice({ text: "링크를 복사하지 못했습니다.", tone: "error" });
    }
  }
  return (
    <button type="button" onClick={share} className={actionPillClass}>
      <Link2 className="size-4" aria-hidden />
      공유
    </button>
  );
}
