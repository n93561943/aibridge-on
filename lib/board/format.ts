import { type Block, stripTeacherOnlyBlocks } from "@/lib/posts/content";

/**
 * 게시판 피드(F-08) 공통 규칙: 정렬·기간, 숫자·시간 표기, 투표, 카드 미리보기.
 * 서버와 화면이 함께 쓰므로 순수 함수만 둔다.
 */

export const FEED_PAGE_SIZE = 20;

export const FEED_SORTS = ["hot", "new", "top"] as const;
export type FeedSort = (typeof FEED_SORTS)[number];

export const TOP_PERIODS = ["day", "week", "all"] as const;
export type TopPeriod = (typeof TOP_PERIODS)[number];

export const feedSortLabels: Record<FeedSort, string> = { hot: "인기", new: "최신", top: "추천순" };
export const topPeriodLabels: Record<TopPeriod, string> = {
  day: "오늘",
  week: "이번 주",
  all: "전체",
};

/** 추천순 기본 기간. 글이 많지 않은 사이트라 "오늘"이면 비어 보이기 쉽다. */
export const DEFAULT_TOP_PERIOD: TopPeriod = "week";

export type FeedOrder = { sort: FeedSort; period: TopPeriod };

/** 주소의 ?sort=·?t= 값을 정렬로 바꾼다. 모르는 값은 기본값(인기, 이번 주). */
export function parseFeedOrder(sort: unknown, period: unknown): FeedOrder {
  const s = FEED_SORTS.includes(sort as FeedSort) ? (sort as FeedSort) : "hot";
  const p = TOP_PERIODS.includes(period as TopPeriod) ? (period as TopPeriod) : DEFAULT_TOP_PERIOD;
  return { sort: s, period: p };
}

/** 정렬 탭 주소. 기본값은 주소에서 뺀다. */
export function feedOrderHref(basePath: string, order: FeedOrder): string {
  const params = new URLSearchParams();
  if (order.sort !== "hot") params.set("sort", order.sort);
  if (order.sort === "top" && order.period !== DEFAULT_TOP_PERIOD) params.set("t", order.period);
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 추천순 기간의 시작 시각. 오늘 = 한국 시간 자정부터, 이번 주 = 최근 7일, 전체 = null. */
export function topPeriodStart(period: TopPeriod, now: Date): Date | null {
  if (period === "all") return null;
  if (period === "week") return new Date(now.getTime() - 7 * DAY_MS);
  const kst = now.getTime() + KST_OFFSET_MS;
  return new Date(kst - (((kst % DAY_MS) + DAY_MS) % DAY_MS) - KST_OFFSET_MS);
}

const compactFormat = new Intl.NumberFormat("ko", { notation: "compact" });

/** 한국어 축약 숫자: 2,900 → 2.9천, 11,000 → 1.1만 */
export function formatCompact(value: number): string {
  return compactFormat.format(value);
}

/** 상대 시간: 방금 전 · 5분 전 · 3시간 전 · 2일 전 · 3주 전 · 4개월 전 · 1년 전 */
export function formatRelativeTime(iso: string, now: Date): string {
  const sec = Math.floor((now.getTime() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(sec) || sec < 60) return "방금 전";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day}일 전`;
  if (day < 30) return `${Math.floor(day / 7)}주 전`;
  if (day < 365) return `${Math.floor(day / 30)}개월 전`;
  return `${Math.floor(day / 365)}년 전`;
}

/** 같은 버튼을 다시 누르면 취소(0), 아니면 누른 값으로 바꾼다. */
export function nextVote(current: number, pressed: 1 | -1): -1 | 0 | 1 {
  return current === pressed ? 0 : pressed;
}

/* ─── 카드 미리보기 ─────────────────────────────────────────── */

const PREVIEW_CHARS = 200;

/** 본문 평문 앞부분(줄바꿈은 공백으로). 화면에서 2줄로 자른다. */
export function previewText(contentText: string): string {
  const flat = contentText.replace(/\s+/g, " ").trim();
  return flat.length > PREVIEW_CHARS ? `${flat.slice(0, PREVIEW_CHARS)}…` : flat;
}

/**
 * 첫 이미지 블록 주소(교사 전용 박스 안은 제외, http(s)만). 없으면 null.
 * allowedPrefix를 주면 그 주소로 시작하는 이미지만 쓴다(게시판: 사이트 Storage 업로드만).
 */
export function firstImageUrl(content: unknown, allowedPrefix?: string): string | null {
  if (!Array.isArray(content)) return null;
  const ok = (url: string) =>
    /^https?:\/\//i.test(url) && (!allowedPrefix || url.startsWith(allowedPrefix));
  const walk = (blocks: Block[]): string | null => {
    for (const block of blocks) {
      const url = block.props?.url;
      if (block.type === "image" && typeof url === "string" && ok(url)) return url;
      const found = Array.isArray(block.children) ? walk(block.children) : null;
      if (found) return found;
    }
    return null;
  };
  return walk(stripTeacherOnlyBlocks(content as Block[]));
}
