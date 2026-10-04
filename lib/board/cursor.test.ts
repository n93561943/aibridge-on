import { describe, expect, it } from "vitest";

import { decodeFeedCursor, encodeFeedCursor, feedCursorFilter } from "./cursor";

const id = "3f1c2a8e-5b7d-4c1a-9e2f-0a1b2c3d4e5f";
const createdAt = "2026-10-03T12:34:56.123456+00:00";

describe("피드 커서", () => {
  it("인코딩한 값을 그대로 되돌린다", () => {
    for (const cursor of [
      { sort: "hot", rank: 39274.123456789, id },
      { sort: "new", createdAt, id },
      { sort: "top", score: -2, createdAt, id },
    ] as const) {
      expect(decodeFeedCursor(encodeFeedCursor(cursor), cursor.sort)).toEqual(cursor);
    }
  });

  it("정렬이 다르거나 위조·손상된 값은 null", () => {
    const hot = encodeFeedCursor({ sort: "hot", rank: 1, id });
    expect(decodeFeedCursor(hot, "new")).toBeNull();
    expect(decodeFeedCursor("not-base64!!", "hot")).toBeNull();
    const forged = Buffer.from(
      JSON.stringify({ sort: "new", createdAt: '2026-01-01T00:00:00Z",id.gt.0', id }),
    ).toString("base64url");
    expect(decodeFeedCursor(forged, "new")).toBeNull();
    const badId = Buffer.from(JSON.stringify({ sort: "hot", rank: 1, id: "1),or(1" })).toString(
      "base64url",
    );
    expect(decodeFeedCursor(badId, "hot")).toBeNull();
    expect(decodeFeedCursor("a".repeat(501), "hot")).toBeNull();
  });

  it("커서 다음 글 조건(내림차순)", () => {
    expect(feedCursorFilter({ sort: "hot", rank: 1.5, id })).toBe(
      `hot_rank.lt.1.5,and(hot_rank.eq.1.5,id.lt.${id})`,
    );
    expect(feedCursorFilter({ sort: "new", createdAt, id })).toBe(
      `created_at.lt."${createdAt}",and(created_at.eq."${createdAt}",id.lt.${id})`,
    );
    expect(feedCursorFilter({ sort: "top", score: 3, createdAt, id })).toBe(
      `score.lt.3,and(score.eq.3,created_at.lt."${createdAt}"),and(score.eq.3,created_at.eq."${createdAt}",id.lt.${id})`,
    );
  });
});
