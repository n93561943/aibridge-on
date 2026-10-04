/**
 * 댓글 트리(F-08): 평평한 댓글 목록 → 대댓글 트리, 삭제·숨김 자리 표시, 정렬.
 * 화면과 서버가 함께 쓰는 순수 함수.
 */

export type CommentRow = {
  id: string;
  parent_id: string | null;
  depth: number;
  author_id: string | null;
  body: string;
  score: number;
  hidden_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CommentState = "visible" | "deleted" | "hidden";

export type CommentNode = {
  id: string;
  depth: number;
  state: CommentState;
  /** 삭제·숨김 댓글은 null(본문·작성자를 화면에 보내지 않는다) */
  body: string | null;
  author: string | null;
  isMine: boolean;
  score: number;
  myVote: number;
  createdAt: string;
  edited: boolean;
  children: CommentNode[];
};

export const COMMENT_SORTS = ["top", "new"] as const;
export type CommentSort = (typeof COMMENT_SORTS)[number];
export const commentSortLabels: Record<CommentSort, string> = { top: "추천순", new: "최신순" };

/** 답글은 5단계(depth 0~4)까지 */
export const MAX_COMMENT_DEPTH = 4;
export const COMMENT_MAX_LENGTH = 3000;

/** 본문을 고친 적이 있는가(touch_comment는 본문이 바뀔 때만 updated_at을 바꾼다) */
function isEdited(row: CommentRow): boolean {
  return new Date(row.updated_at).getTime() - new Date(row.created_at).getTime() > 1000;
}

/**
 * 트리를 만든다. 삭제·숨김 댓글은 보이는 답글이 있으면 자리만 남기고, 없으면 뺀다.
 * 부모를 찾을 수 없는 댓글(부모가 목록에 없음)도 뺀다.
 */
export function buildCommentTree(
  rows: CommentRow[],
  opts: {
    nicknames: Map<string, string>;
    votes: Map<string, number>;
    viewerId: string | null;
  },
): CommentNode[] {
  const nodes = new Map<string, CommentNode>();
  const parentOf = new Map<string, string | null>();
  for (const row of rows) {
    parentOf.set(row.id, row.parent_id);
    const state: CommentState = row.hidden_at ? "hidden" : row.deleted_at ? "deleted" : "visible";
    const visible = state === "visible";
    nodes.set(row.id, {
      id: row.id,
      depth: row.depth,
      state,
      body: visible ? row.body : null,
      author: visible
        ? ((row.author_id && opts.nicknames.get(row.author_id)) ?? "알 수 없음")
        : null,
      isMine: visible && !!opts.viewerId && row.author_id === opts.viewerId,
      score: row.score,
      myVote: visible ? (opts.votes.get(row.id) ?? 0) : 0,
      createdAt: row.created_at,
      edited: visible && isEdited(row),
      children: [],
    });
  }

  const roots: CommentNode[] = [];
  for (const node of nodes.values()) {
    const parentId = parentOf.get(node.id) ?? null;
    if (parentId === null) roots.push(node);
    else nodes.get(parentId)?.children.push(node);
  }

  const prune = (list: CommentNode[]): CommentNode[] =>
    list.flatMap((node) => {
      const children = prune(node.children);
      if (node.state !== "visible" && children.length === 0) return [];
      return [{ ...node, children }];
    });
  return prune(roots);
}

/** 같은 단계끼리 정렬한다. 추천순: 점수 높은 순 → 먼저 쓴 순, 최신순: 나중에 쓴 순. */
export function sortCommentTree(nodes: CommentNode[], sort: CommentSort): CommentNode[] {
  const compare =
    sort === "top"
      ? (a: CommentNode, b: CommentNode) =>
          b.score - a.score || a.createdAt.localeCompare(b.createdAt)
      : (a: CommentNode, b: CommentNode) => b.createdAt.localeCompare(a.createdAt);
  return [...nodes]
    .sort(compare)
    .map((node) => ({ ...node, children: sortCommentTree(node.children, sort) }));
}

/** 트리 안 보이는 댓글 수 */
export function countVisible(nodes: CommentNode[]): number {
  return nodes.reduce(
    (n, node) => n + (node.state === "visible" ? 1 : 0) + countVisible(node.children),
    0,
  );
}
