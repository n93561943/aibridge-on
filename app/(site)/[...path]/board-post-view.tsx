import { PostContent } from "@/components/content/post-content";
import type { CommentNode } from "@/lib/board/comment-tree";
import { formatRelativeTime } from "@/lib/board/format";
import type { BoardDetailViewer, BoardPostDetail } from "@/lib/board/post";
import { menuPath, type MenuNode } from "@/lib/menus/tree";

import { BoardPostActionsBar } from "./board-post-actions-bar";
import { Breadcrumb } from "./breadcrumb";
import { CommentSection } from "./comment-section";

/** 게시판 글 상세(F-08): 본문 + 투표·공유·관리 + 댓글 트리 */
export function BoardPostView({
  menu,
  parent,
  post,
  comments,
  viewer,
  imageUrlPrefix,
  now,
}: {
  menu: MenuNode;
  parent: MenuNode | null;
  post: BoardPostDetail;
  comments: CommentNode[];
  viewer: BoardDetailViewer;
  /** 게시판 이미지는 사이트 Storage 주소만 그린다(외부 이미지 차단) */
  imageUrlPrefix: string;
  now: number;
}) {
  const boardPath = menuPath(menu, parent)!;
  const loginHref = `/login?next=${encodeURIComponent(post.href)}`;

  return (
    <div className="container-site flex max-w-3xl flex-col gap-6 py-8 sm:py-12">
      <Breadcrumb
        items={[
          ...(parent ? [{ label: parent.title }] : []),
          { label: menu.title, href: boardPath },
        ]}
      />
      <article aria-labelledby="post-title" className="flex flex-col gap-4">
        <header className="flex flex-col gap-2">
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            {post.isPinned && (
              <span className="rounded bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground">
                공지
              </span>
            )}
            <span className="font-semibold text-foreground">{menu.title}</span>
            <span aria-hidden>·</span>
            <span>{post.author}</span>
            <span aria-hidden>·</span>
            <time dateTime={post.createdAt}>
              {formatRelativeTime(post.createdAt, new Date(now))}
            </time>
          </p>
          <h1 id="post-title" className="text-2xl font-bold break-keep sm:text-3xl">
            {post.title}
          </h1>
        </header>

        {post.content.length > 0 && (
          <PostContent
            blocks={post.content}
            judgeUrlTemplate={null}
            imageUrlPrefix={imageUrlPrefix}
          />
        )}

        <BoardPostActionsBar
          menuId={menu.id}
          post={post}
          allowVotes={menu.board_allow_votes}
          canVote={viewer.isActive}
          isAdmin={viewer.isAdmin}
          loginHref={loginHref}
        />
      </article>

      <hr />

      <CommentSection
        postId={post.id}
        comments={comments}
        commentCount={post.commentCount}
        allowComments={menu.board_allow_comments}
        allowVotes={menu.board_allow_votes}
        viewer={{
          isLoggedIn: viewer.userId !== null,
          isActive: viewer.isActive,
          isAdmin: viewer.isAdmin,
        }}
        loginHref={loginHref}
        now={now}
      />
    </div>
  );
}
