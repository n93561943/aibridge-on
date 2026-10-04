import "server-only";

import { z } from "zod";

import type { FeedSort } from "./format";

/*
 * 무한 스크롤 커서: 정렬 키 + id로 "이 글 다음"을 가리킨다. 스크롤 중 새 글이 올라와도 같은 글이 두 번 나오지 않는다.
 * 브라우저를 거쳐 돌아오는 값이므로 서버는 반드시 decodeFeedCursor로 검증한다.
 */

const isoTimestamp = z.iso.datetime({ offset: true });

const cursorSchema = z.discriminatedUnion("sort", [
  z.object({ sort: z.literal("hot"), rank: z.number().finite(), id: z.uuid() }),
  z.object({ sort: z.literal("new"), createdAt: isoTimestamp, id: z.uuid() }),
  z.object({
    sort: z.literal("top"),
    score: z.number().int(),
    createdAt: isoTimestamp,
    id: z.uuid(),
  }),
]);

export type FeedCursor = z.infer<typeof cursorSchema>;

export function encodeFeedCursor(cursor: FeedCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

/** 잘못된 값이거나 정렬이 다르면 null */
export function decodeFeedCursor(value: string, sort: FeedSort): FeedCursor | null {
  if (value.length > 500) return null;
  try {
    const parsed = cursorSchema.safeParse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
    return parsed.success && parsed.data.sort === sort ? parsed.data : null;
  } catch {
    return null;
  }
}

/** 커서 다음 글만 남기는 PostgREST or 조건(내림차순 정렬 기준). 값은 검증된 커서에서만 온다. */
export function feedCursorFilter(cursor: FeedCursor): string {
  switch (cursor.sort) {
    case "hot":
      return `hot_rank.lt.${cursor.rank},and(hot_rank.eq.${cursor.rank},id.lt.${cursor.id})`;
    case "new":
      return `created_at.lt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",id.lt.${cursor.id})`;
    case "top":
      return [
        `score.lt.${cursor.score}`,
        `and(score.eq.${cursor.score},created_at.lt."${cursor.createdAt}")`,
        `and(score.eq.${cursor.score},created_at.eq."${cursor.createdAt}",id.lt.${cursor.id})`,
      ].join(",");
  }
}
