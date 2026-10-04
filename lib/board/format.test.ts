import { describe, expect, it } from "vitest";

import {
  feedOrderHref,
  firstImageUrl,
  formatCompact,
  formatRelativeTime,
  nextVote,
  parseFeedOrder,
  previewText,
  topPeriodStart,
} from "./format";

describe("정렬·기간", () => {
  it("모르는 값은 기본값(인기·이번 주)", () => {
    expect(parseFeedOrder(undefined, undefined)).toEqual({ sort: "hot", period: "week" });
    expect(parseFeedOrder("top", "day")).toEqual({ sort: "top", period: "day" });
    expect(parseFeedOrder("hack", ["all"])).toEqual({ sort: "hot", period: "week" });
  });

  it("탭 주소에서 기본값은 뺀다", () => {
    expect(feedOrderHref("/notice", { sort: "hot", period: "day" })).toBe("/notice");
    expect(feedOrderHref("/notice", { sort: "new", period: "day" })).toBe("/notice?sort=new");
    expect(feedOrderHref("/g/b", { sort: "top", period: "week" })).toBe("/g/b?sort=top");
    expect(feedOrderHref("/g/b", { sort: "top", period: "all" })).toBe("/g/b?sort=top&t=all");
  });

  it("오늘 = 한국 시간 자정부터", () => {
    // 한국 10월 4일 08:30 = UTC 10월 3일 23:30 → 시작은 한국 10월 4일 00:00 = UTC 10월 3일 15:00
    expect(topPeriodStart("day", new Date("2026-10-03T23:30:00Z"))?.toISOString()).toBe(
      "2026-10-03T15:00:00.000Z",
    );
    // 한국 10월 3일 23:59 = UTC 14:59 → 시작은 UTC 10월 2일 15:00
    expect(topPeriodStart("day", new Date("2026-10-03T14:59:00Z"))?.toISOString()).toBe(
      "2026-10-02T15:00:00.000Z",
    );
  });

  it("이번 주 = 최근 7일, 전체 = 제한 없음", () => {
    expect(topPeriodStart("week", new Date("2026-10-10T00:00:00Z"))?.toISOString()).toBe(
      "2026-10-03T00:00:00.000Z",
    );
    expect(topPeriodStart("all", new Date())).toBeNull();
  });
});

describe("표기", () => {
  it("숫자는 한국어 축약", () => {
    expect(formatCompact(999)).toBe("999");
    expect(formatCompact(2900)).toBe("2.9천");
    expect(formatCompact(11000)).toBe("1.1만");
    expect(formatCompact(-3)).toBe("-3");
  });

  it("상대 시간", () => {
    const now = new Date("2026-10-03T12:00:00Z");
    const ago = (sec: number) => new Date(now.getTime() - sec * 1000).toISOString();
    expect(formatRelativeTime(ago(30), now)).toBe("방금 전");
    expect(formatRelativeTime(ago(-120), now)).toBe("방금 전"); // 시계 차이로 미래 시각
    expect(formatRelativeTime(ago(5 * 60), now)).toBe("5분 전");
    expect(formatRelativeTime(ago(5 * 3600), now)).toBe("5시간 전");
    expect(formatRelativeTime(ago(2 * 86400), now)).toBe("2일 전");
    expect(formatRelativeTime(ago(15 * 86400), now)).toBe("2주 전");
    expect(formatRelativeTime(ago(90 * 86400), now)).toBe("3개월 전");
    expect(formatRelativeTime(ago(400 * 86400), now)).toBe("1년 전");
  });
});

describe("투표", () => {
  it("같은 버튼은 취소, 반대 버튼은 전환", () => {
    expect(nextVote(0, 1)).toBe(1);
    expect(nextVote(1, 1)).toBe(0);
    expect(nextVote(1, -1)).toBe(-1);
    expect(nextVote(-1, -1)).toBe(0);
  });
});

describe("카드 미리보기", () => {
  it("평문은 공백을 합치고 200자에서 자른다", () => {
    expect(previewText("  첫 줄\n\n둘째   줄 ")).toBe("첫 줄 둘째 줄");
    const long = previewText("가".repeat(300));
    expect(long).toHaveLength(201);
    expect(long.endsWith("…")).toBe(true);
  });

  const block = (type: string, props: Record<string, unknown> = {}, children: unknown[] = []) => ({
    id: Math.random().toString(36),
    type,
    props,
    content: [],
    children,
  });

  it("첫 이미지(하위 블록 포함)를 찾는다", () => {
    expect(
      firstImageUrl([
        block("paragraph"),
        block("bulletListItem", {}, [block("image", { url: "https://cdn.test/a.png" })]),
        block("image", { url: "https://cdn.test/b.png" }),
      ]),
    ).toBe("https://cdn.test/a.png");
  });

  it("교사 전용 박스 안 이미지·http(s)가 아닌 주소는 쓰지 않는다", () => {
    expect(
      firstImageUrl([
        block("teacherBox", {}, [block("image", { url: "https://cdn.test/secret.png" })]),
        block("image", { url: "javascript:alert(1)" }),
        block("image", { url: "" }),
      ]),
    ).toBeNull();
    expect(firstImageUrl(null)).toBeNull();
  });

  it("허용 주소를 주면 그 주소로 시작하는 이미지만 쓴다", () => {
    const prefix = "https://abc.supabase.co/storage/v1/object/public/post-files/";
    const content = [
      block("image", { url: "https://evil.test/storage/v1/object/public/post-files/board/a.png" }),
      block("image", { url: `${prefix}board/u/b.png` }),
    ];
    expect(firstImageUrl(content, prefix)).toBe(`${prefix}board/u/b.png`);
    expect(firstImageUrl(content.slice(0, 1), prefix)).toBeNull();
  });
});
