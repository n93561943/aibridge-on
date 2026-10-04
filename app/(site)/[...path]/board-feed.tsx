import Link from "next/link";
import { PenSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { BoardFeedPage, BoardViewer } from "@/lib/board/feed";
import {
  type FeedOrder,
  FEED_SORTS,
  feedOrderHref,
  feedSortLabels,
  TOP_PERIODS,
  topPeriodLabels,
} from "@/lib/board/format";
import { menuPath, type MenuNode } from "@/lib/menus/tree";
import { cn } from "@/lib/utils";

import { BoardFeedList } from "./board-feed-list";
import { Breadcrumb } from "./breadcrumb";

/** 레딧 스타일 게시판 피드(F-08): 정렬 탭 + 카드 목록(무한 스크롤) */
export function BoardFeed({
  menu,
  parent,
  order,
  page,
  viewer,
  now,
}: {
  menu: MenuNode;
  parent: MenuNode | null;
  order: FeedOrder;
  page: BoardFeedPage;
  viewer: BoardViewer;
  now: number;
}) {
  const basePath = menuPath(menu, parent)!;
  const tabClass = (active: boolean) =>
    cn(
      "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
      active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
    );

  return (
    <div className="container-site flex max-w-3xl flex-col gap-5 py-8 sm:py-12">
      <Breadcrumb items={[...(parent ? [{ label: parent.title }] : []), { label: menu.title }]} />
      <header className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 text-2xl font-bold break-keep sm:text-3xl">{menu.title}</h1>
        {viewer.canWrite && (
          <Button asChild size="lg" className="shrink-0">
            <Link href={`${basePath}/submit`} prefetch={false}>
              <PenSquare aria-hidden />
              글쓰기
            </Link>
          </Button>
        )}
      </header>

      <div className="flex flex-col gap-2">
        <nav aria-label="정렬">
          <ul className="flex flex-wrap gap-1">
            {FEED_SORTS.map((sort) => (
              <li key={sort}>
                <Link
                  href={feedOrderHref(basePath, { ...order, sort })}
                  aria-current={order.sort === sort ? "page" : undefined}
                  className={tabClass(order.sort === sort)}
                  scroll={false}
                >
                  {feedSortLabels[sort]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {order.sort === "top" && (
          <nav aria-label="기간">
            <ul className="flex flex-wrap gap-1">
              {TOP_PERIODS.map((period) => (
                <li key={period}>
                  <Link
                    href={feedOrderHref(basePath, { sort: "top", period })}
                    aria-current={order.period === period ? "page" : undefined}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      order.period === period
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                    scroll={false}
                  >
                    {topPeriodLabels[period]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>

      <BoardFeedList
        // 정렬이 바뀌면 목록 상태(불러온 글·커서)를 새로 시작한다.
        key={`${order.sort}-${order.period}`}
        menuId={menu.id}
        menuTitle={menu.title}
        order={order}
        initialPage={page}
        canVote={viewer.canVote}
        allowVotes={menu.board_allow_votes}
        allowComments={menu.board_allow_comments}
        loginHref={`/login?next=${encodeURIComponent(basePath)}`}
        now={now}
      />
    </div>
  );
}
