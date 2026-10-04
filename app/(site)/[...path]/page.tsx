import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getBoardFeedPage, getBoardViewer } from "@/lib/board/feed";
import { parseFeedOrder } from "@/lib/board/format";
import { getPublicMenuTree } from "@/lib/menus/queries";
import { menuHref, resolveMenuPath } from "@/lib/menus/tree";
import {
  getPreviewPost,
  getPublishedPost,
  getViewer,
  listPublishedPosts,
  type PublicPost,
} from "@/lib/posts/public";
import { getOnlineJudgeTemplate } from "@/lib/settings/queries";

import { BoardFeed } from "./board-feed";
import { PostView } from "./post-view";
import { SeriesList } from "./series-list";

type Props = {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<{ preview?: string; sort?: string; t?: string }>;
};

async function resolve(path: string[]) {
  return resolveMenuPath(await getPublicMenuTree(), path.map(decodeURIComponent));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { path } = await params;
  const resolved = await resolve(path);
  if (!resolved) return {};
  if (!resolved.postSlug) return { title: resolved.menu.title };
  const post = await getPublishedPost(resolved.menu.id, resolved.postSlug, {
    canSeeTeacherOnly: false,
    isAdmin: false,
  });
  if (!post) return { title: resolved.menu.title };
  return {
    title: `${post.title} - ${resolved.menu.title}`,
    // 교사 전용 블록은 평문에서 이미 빠져 있다.
    description: post.summary ?? (post.contentText.slice(0, 150) || undefined),
  };
}

/**
 * 메뉴·글 공개 주소(F-07). /메뉴, /메뉴/글, /그룹/하위메뉴, /그룹/하위메뉴/글.
 * group은 첫 하위 메뉴로, link는 외부 주소로 보낸다. 게시판(board) 목록은 피드(F-08).
 */
export default async function MenuOrPostPage({ params, searchParams }: Props) {
  const [{ path }, { preview, sort, t }] = await Promise.all([params, searchParams]);
  const resolved = await resolve(path);
  if (!resolved) notFound();
  const { menu, parent, postSlug } = resolved;

  if (menu.type === "group" || menu.type === "link") {
    if (postSlug) notFound();
    const target = menuHref(menu, parent);
    if (!target) notFound();
    redirect(target.href);
  }

  if (menu.type === "board") {
    if (postSlug) notFound();
    const order = parseFeedOrder(sort, t);
    const now = new Date();
    const [page, viewer] = await Promise.all([
      getBoardFeedPage(menu, parent, order, null, now),
      getBoardViewer(menu.id),
    ]);
    return (
      <BoardFeed
        menu={menu}
        parent={parent}
        order={order}
        page={page}
        viewer={viewer}
        now={now.getTime()}
      />
    );
  }

  if (!postSlug)
    return <SeriesList menu={menu} parent={parent} posts={await listPublishedPosts(menu.id)} />;

  const viewer = await getViewer();
  const [published, lessons, judgeUrlTemplate] = await Promise.all([
    getPublishedPost(menu.id, postSlug, viewer),
    listPublishedPosts(menu.id),
    getOnlineJudgeTemplate(),
  ]);

  // 관리자 미리보기: ?preview=1이거나, 아직 공개되지 않은 글을 관리자가 열었을 때
  let post: PublicPost | null = published;
  let previewInfo: { status: "draft" | "published" } | null = null;
  if (viewer.isAdmin && (preview === "1" || !published)) {
    const draft = await getPreviewPost(menu.id, postSlug, viewer);
    if (draft) {
      post = draft;
      previewInfo = { status: draft.status };
    }
  }
  if (!post) notFound();

  return (
    <PostView
      menu={menu}
      parent={parent}
      post={post}
      lessons={lessons}
      judgeUrlTemplate={judgeUrlTemplate}
      preview={previewInfo}
      editHref={viewer.isAdmin ? `/admin/posts/${post.id}` : null}
    />
  );
}
