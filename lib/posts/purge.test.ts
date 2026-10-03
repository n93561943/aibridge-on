import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { Database } from "@/types/database";

import { purgeExpiredTrash, trashCutoff } from "./purge";

type Post = { id: string; deleted_at: string | null };
type Attachment = { post_id: string; storage_path: string };

/** purgeExpiredTrash가 쓰는 쿼리만 흉내 내는 메모리 DB */
function fakeDb(posts: Post[], attachments: Attachment[], opts: { removeFails?: boolean } = {}) {
  const removed: string[] = [];
  const db = {
    from(table: "posts" | "attachments") {
      let filter: (row: Record<string, unknown>) => boolean = () => true;
      let limit = Infinity;
      const rows = () => (table === "posts" ? posts : attachments) as Record<string, unknown>[];
      const builder = {
        select() {
          return builder;
        },
        lt(col: string, value: string) {
          filter = (r) => r[col] !== null && String(r[col]) < value;
          return builder;
        },
        in(col: string, values: string[]) {
          filter = (r) => values.includes(String(r[col]));
          return builder;
        },
        limit(n: number) {
          limit = n;
          return builder;
        },
        delete() {
          return {
            in(col: string, values: string[]) {
              for (let i = posts.length - 1; i >= 0; i--) {
                if (values.includes(String((posts[i] as Record<string, unknown>)[col]))) {
                  const [gone] = posts.splice(i, 1);
                  // cascade
                  for (let j = attachments.length - 1; j >= 0; j--) {
                    if (attachments[j].post_id === gone.id) attachments.splice(j, 1);
                  }
                }
              }
              return Promise.resolve({ error: null });
            },
          };
        },
        then(resolve: (v: { data: unknown[]; error: null }) => void) {
          resolve({ data: rows().filter(filter).slice(0, limit), error: null });
        },
      };
      return builder;
    },
    storage: {
      from() {
        return {
          remove(paths: string[]) {
            if (opts.removeFails) return Promise.resolve({ error: { message: "storage down" } });
            removed.push(...paths);
            return Promise.resolve({ error: null });
          },
        };
      },
    },
  };
  return { db: db as unknown as SupabaseClient<Database>, removed };
}

const NOW = new Date("2026-10-31T00:00:00Z");
const days = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe("trashCutoff", () => {
  it("30일 전 시각", () => {
    expect(trashCutoff(NOW).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});

describe("purgeExpiredTrash", () => {
  it("30일이 지난 휴지통 글과 그 파일만 지운다", async () => {
    const posts: Post[] = [
      { id: "old", deleted_at: days(31) },
      { id: "recent", deleted_at: days(29) },
      { id: "live", deleted_at: null },
    ];
    const attachments: Attachment[] = [
      { post_id: "old", storage_path: "old/a.png" },
      { post_id: "old", storage_path: "old/b.pdf" },
      { post_id: "recent", storage_path: "recent/c.png" },
    ];
    const { db, removed } = fakeDb(posts, attachments);

    expect(await purgeExpiredTrash(db, NOW)).toEqual({ posts: 1, files: 2 });
    expect(removed).toEqual(["old/a.png", "old/b.pdf"]);
    expect(posts.map((p) => p.id)).toEqual(["recent", "live"]);
    expect(attachments.map((a) => a.storage_path)).toEqual(["recent/c.png"]);
  });

  it("100개가 넘으면 여러 번에 나눠 지운다", async () => {
    const posts: Post[] = Array.from({ length: 230 }, (_, i) => ({
      id: `p${i}`,
      deleted_at: days(40),
    }));
    const { db } = fakeDb(posts, []);
    expect(await purgeExpiredTrash(db, NOW)).toEqual({ posts: 230, files: 0 });
    expect(posts).toHaveLength(0);
  });

  it("파일 삭제가 실패하면 게시물을 지우지 않고 오류를 낸다(다음 실행 때 재시도)", async () => {
    const posts: Post[] = [{ id: "old", deleted_at: days(31) }];
    const { db } = fakeDb(posts, [{ post_id: "old", storage_path: "old/a.png" }], {
      removeFails: true,
    });
    await expect(purgeExpiredTrash(db, NOW)).rejects.toThrow("파일 삭제 실패");
    expect(posts).toHaveLength(1);
  });
});
