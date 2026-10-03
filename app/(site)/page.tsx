import {
  ArrowRightIcon,
  BookOpenIcon,
  ExternalLinkIcon,
  FolderIcon,
  MegaphoneIcon,
} from "lucide-react";
import Link from "next/link";

import { getPublicMenuTree } from "@/lib/menus/queries";
import { menuHref, type MenuNode, postPath } from "@/lib/menus/tree";
import { listRecentPublished, type RecentPost } from "@/lib/posts/public";
import { getHomeHeroText } from "@/lib/settings/queries";
import { bridgeStages, type BridgeStageKey, siteConfig } from "@/lib/site";
import { cn } from "@/lib/utils";

const stageColor: Record<BridgeStageKey, string> = {
  literacy: "bg-stage-literacy text-stage-literacy-foreground",
  usage: "bg-stage-usage text-stage-usage-foreground",
  coding: "bg-stage-coding text-stage-coding-foreground",
  project: "bg-stage-project text-stage-project-foreground",
};

const RECENT_LESSONS = 6;
const RECENT_NOTICES = 3;

function dateLabel(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleDateString("ko-KR", {
        month: "long",
        day: "numeric",
        timeZone: "Asia/Seoul",
      })
    : "";
}

/** 홈(F-11): 로고·부제, AI Bridge 모델, 메뉴 바로가기, 최근 공개 자료 6개, 최근 공지 3개 */
export default async function HomePage() {
  const [tree, recent, heroText] = await Promise.all([
    getPublicMenuTree(),
    listRecentPublished(60).catch(() => [] as RecentPost[]),
    getHomeHeroText(),
  ]);

  // 공개 메뉴(상위 그룹까지 활성)의 글만, 메뉴 종류별로 나눈다.
  const menus = new Map<string, { menu: MenuNode; parent: MenuNode | null }>();
  for (const node of tree) {
    menus.set(node.id, { menu: node, parent: null });
    for (const child of node.children)
      if (child.is_active) menus.set(child.id, { menu: child, parent: node });
  }
  const withMenu = recent.flatMap((post) => {
    const m = menus.get(post.menuId);
    return m ? [{ post, ...m }] : [];
  });
  const lessons = withMenu.filter((x) => x.menu.type === "series").slice(0, RECENT_LESSONS);
  const notices = withMenu.filter((x) => x.menu.type === "board").slice(0, RECENT_NOTICES);

  const cards = tree.flatMap((node) => {
    const target = menuHref(node);
    return target ? [{ node, ...target }] : [];
  });

  return (
    <div className="container-site flex flex-col gap-14 py-12 sm:py-20">
      <section className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
          AI Bridge<span className="text-brand">:ON</span>
        </h1>
        <p className="text-lg break-keep whitespace-pre-line text-muted-foreground sm:text-xl">
          {heroText ?? siteConfig.tagline}
        </p>
      </section>

      <section aria-labelledby="model-heading" className="flex flex-col gap-4">
        <h2 id="model-heading" className="text-xl font-semibold">
          AI Bridge 교육 모델
        </h2>
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {bridgeStages.map((stage, index) => (
            <li
              key={stage.key}
              className={cn("flex flex-col gap-1 rounded-xl p-4", stageColor[stage.key])}
            >
              <span className="text-xs font-medium">
                {index + 1}단계 · {stage.english}
              </span>
              <span className="text-lg font-bold">{stage.label}</span>
            </li>
          ))}
        </ol>
      </section>

      {cards.length > 0 && (
        <section aria-labelledby="menus-heading" className="flex flex-col gap-4">
          <h2 id="menus-heading" className="text-xl font-semibold">
            메뉴 바로가기
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map(({ node, href, external }) => {
              const Icon =
                node.type === "group"
                  ? FolderIcon
                  : node.type === "board"
                    ? MegaphoneIcon
                    : node.type === "link"
                      ? ExternalLinkIcon
                      : BookOpenIcon;
              const children =
                node.type === "group"
                  ? node.children.filter(
                      (c) => c.is_active && (c.type !== "link" || c.external_url),
                    )
                  : [];
              return (
                <li key={node.id}>
                  <Link
                    href={href}
                    {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="group flex h-full flex-col gap-2 rounded-xl border p-4 transition-colors hover:bg-muted/50"
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <Icon className="size-4 text-brand" aria-hidden />
                      {node.title}
                      <ArrowRightIcon
                        className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </span>
                    {children.length > 0 && (
                      <span className="text-sm break-keep text-muted-foreground">
                        {children.map((c) => c.title).join(" · ")}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="recent-heading" className="flex flex-col gap-4">
        <h2 id="recent-heading" className="text-xl font-semibold">
          최근 공개 자료
        </h2>
        {lessons.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            곧 수업 자료가 올라옵니다.
          </p>
        ) : (
          <ul aria-label="최근 공개 자료" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {lessons.map(({ post, menu, parent }) => (
              <li key={post.id}>
                <Link
                  href={postPath(menu, parent, post.slug)}
                  className="flex h-full flex-col gap-1 rounded-xl border p-4 hover:bg-muted/50"
                >
                  <span className="text-xs text-muted-foreground">
                    {menu.title}
                    {post.lessonNo !== null && ` · ${post.lessonNo}차시`}
                  </span>
                  <span className="font-semibold break-keep">{post.title}</span>
                  {post.summary && (
                    <span className="line-clamp-2 text-sm text-muted-foreground">
                      {post.summary}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {notices.length > 0 && (
        <section aria-labelledby="notice-heading" className="flex flex-col gap-4">
          <h2 id="notice-heading" className="text-xl font-semibold">
            최근 공지
          </h2>
          <ul aria-label="최근 공지" className="flex flex-col divide-y rounded-xl border">
            {notices.map(({ post, menu, parent }) => (
              <li key={post.id}>
                <Link
                  href={postPath(menu, parent, post.slug)}
                  className="flex items-center gap-3 p-4 hover:bg-muted/50"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{post.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {dateLabel(post.publishedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
