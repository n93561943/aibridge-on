import { describe, expect, it } from "vitest";

import { buildCommentTree, type CommentRow, countVisible, sortCommentTree } from "./comment-tree";

const T = (min: number) => new Date(Date.UTC(2026, 9, 4, 0, min)).toISOString();

function row(id: string, values: Partial<CommentRow> = {}): CommentRow {
  return {
    id,
    parent_id: null,
    depth: 0,
    author_id: "u1",
    body: `본문 ${id}`,
    score: 0,
    hidden_at: null,
    deleted_at: null,
    created_at: T(0),
    updated_at: T(0),
    ...values,
  };
}

const opts = {
  nicknames: new Map([
    ["u1", "하나"],
    ["u2", "둘"],
  ]),
  votes: new Map([["b", 1]]),
  viewerId: "u2",
};

describe("댓글 트리", () => {
  it("대댓글을 부모 아래에 붙이고 작성자·내 투표·수정 여부를 채운다", () => {
    const tree = buildCommentTree(
      [
        row("a"),
        row("b", { parent_id: "a", depth: 1, author_id: "u2", updated_at: T(5) }),
        row("c", { author_id: null }),
      ],
      opts,
    );
    expect(tree.map((n) => n.id)).toEqual(["a", "c"]);
    const [a, c] = tree;
    expect(a.author).toBe("하나");
    expect(a.isMine).toBe(false);
    expect(a.children[0]).toMatchObject({
      id: "b",
      author: "둘",
      isMine: true,
      myVote: 1,
      edited: true,
    });
    expect(c.author).toBe("알 수 없음");
  });

  it("삭제·숨김 댓글은 답글이 있으면 자리만 남기고(본문·작성자 없음), 없으면 뺀다", () => {
    const tree = buildCommentTree(
      [
        row("gone", { deleted_at: T(1), body: "" }),
        row("del", { deleted_at: T(1), body: "" }),
        row("reply", { parent_id: "del", depth: 1 }),
        row("hid", { hidden_at: T(1), body: "숨긴 본문" }),
        row("hreply", { parent_id: "hid", depth: 1 }),
        row("deep-del", { parent_id: "hid", depth: 1, deleted_at: T(2), body: "" }),
      ],
      opts,
    );
    expect(tree.map((n) => [n.id, n.state])).toEqual([
      ["del", "deleted"],
      ["hid", "hidden"],
    ]);
    expect(tree[1]).toMatchObject({ body: null, author: null, isMine: false });
    expect(tree[1].children.map((n) => n.id)).toEqual(["hreply"]);
    expect(countVisible(tree)).toBe(2);
  });

  it("삭제된 댓글 아래 삭제된 답글만 있으면 둘 다 뺀다", () => {
    const tree = buildCommentTree(
      [
        row("x", { deleted_at: T(1), body: "" }),
        row("y", { parent_id: "x", depth: 1, deleted_at: T(2), body: "" }),
      ],
      opts,
    );
    expect(tree).toEqual([]);
  });

  it("부모가 목록에 없는 댓글은 뺀다", () => {
    expect(buildCommentTree([row("o", { parent_id: "missing", depth: 1 })], opts)).toEqual([]);
  });
});

describe("댓글 정렬", () => {
  const tree = buildCommentTree(
    [
      row("old", { score: 5, created_at: T(1) }),
      row("new", { score: 1, created_at: T(9) }),
      row("tie", { score: 5, created_at: T(3) }),
      row("r1", { parent_id: "old", depth: 1, score: 0, created_at: T(4) }),
      row("r2", { parent_id: "old", depth: 1, score: 3, created_at: T(8) }),
    ],
    opts,
  );

  it("추천순: 점수 높은 순, 같으면 먼저 쓴 순(답글도)", () => {
    const sorted = sortCommentTree(tree, "top");
    expect(sorted.map((n) => n.id)).toEqual(["old", "tie", "new"]);
    expect(sorted[0].children.map((n) => n.id)).toEqual(["r2", "r1"]);
  });

  it("최신순: 나중에 쓴 순(답글도)", () => {
    const sorted = sortCommentTree(tree, "new");
    expect(sorted.map((n) => n.id)).toEqual(["new", "tie", "old"]);
    expect(sorted[2].children.map((n) => n.id)).toEqual(["r2", "r1"]);
  });
});
