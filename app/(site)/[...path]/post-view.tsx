import { ChevronLeftIcon, ChevronRightIcon, PencilIcon } from "lucide-react";
import Link from "next/link";

import { PostContent } from "@/components/content/post-content";
import type { MenuNode } from "@/lib/menus/tree";
import { postPath } from "@/lib/menus/tree";
import type { PublicPost, PublicPostSummary } from "@/lib/posts/public";
import { cn } from "@/lib/utils";

import { Breadcrumb } from "./breadcrumb";

function lessonLabel(p: PublicPostSummary) {
  return p.lessonNo !== null ? `${p.lessonNo}차시` : null;
}

/** 차시 상세(F-07): 데스크톱 좌측 차시 목차, 하단 이전/다음, 인쇄용 스타일 */
export function PostView({
  menu,
  parent,
  post,
  lessons,
  judgeUrlTemplate,
  preview,
  editHref,
}: {
  menu: MenuNode;
  parent: MenuNode | null;
  post: PublicPost;
  lessons: PublicPostSummary[];
  judgeUrlTemplate: string | null;
  preview: { status: "draft" | "published" } | null;
  editHref: string | null;
}) {
  const index = lessons.findIndex((l) => l.id === post.id);
  const prev = index > 0 ? lessons[index - 1] : null;
  const next = index >= 0 && index < lessons.length - 1 ? lessons[index + 1] : null;
  const href = (p: PublicPostSummary) => postPath(menu, parent, p.slug);
  const menuHref = postPath(menu, parent, "").replace(/\/$/, "");

  const toc = (
    <ol className="flex flex-col gap-0.5 text-sm">
      {lessons.map((l) => (
        <li key={l.id}>
          <Link
            href={href(l)}
            aria-current={l.id === post.id ? "page" : undefined}
            className={cn(
              "flex gap-2 rounded-md px-2 py-1.5 hover:bg-muted",
              l.id === post.id ? "bg-muted font-semibold text-foreground" : "text-muted-foreground",
            )}
          >
            {l.lessonNo !== null && <span className="w-8 shrink-0 tabular-nums">{l.lessonNo}</span>}
            <span className="min-w-0 break-keep">{l.title}</span>
          </Link>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="container-site py-8 sm:py-12">
      {preview && (
        <p
          role="note"
          className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 print:hidden"
        >
          관리자 미리보기 ·{" "}
          {preview.status === "draft"
            ? "공개되지 않은 초안입니다."
            : "아직 사이트에 반영하지 않은 수정본입니다."}{" "}
          학생에게는 보이지 않습니다.
        </p>
      )}
      <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="hidden lg:block print:hidden">
          <nav
            aria-label={`${menu.title} 차시 목차`}
            className="sticky top-[calc(var(--header-height)+1.5rem)] flex max-h-[calc(100dvh-var(--header-height)-3rem)] flex-col gap-2 overflow-y-auto"
          >
            <Link href={menuHref} className="px-2 text-sm font-semibold hover:underline">
              {menu.title}
            </Link>
            {toc}
          </nav>
        </aside>

        <article className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-4">
          <Breadcrumb
            items={[
              ...(parent ? [{ label: parent.title }] : []),
              { label: menu.title, href: menuHref },
              { label: post.title },
            ]}
          />

          {lessons.length > 1 && (
            <details className="rounded-lg border lg:hidden print:hidden">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                차시 목차 ({lessons.length})
              </summary>
              <nav aria-label={`${menu.title} 차시 목차`} className="border-t p-2">
                {toc}
              </nav>
            </details>
          )}

          <header className="flex flex-col gap-2">
            {lessonLabel(post) && (
              <p className="text-sm font-semibold text-brand">{lessonLabel(post)}</p>
            )}
            <div className="flex items-start gap-2">
              <h1 className="flex-1 text-2xl font-bold break-keep sm:text-3xl">{post.title}</h1>
              {editHref && (
                <Link
                  href={editHref}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-sm text-muted-foreground hover:text-foreground print:hidden"
                >
                  <PencilIcon className="size-3.5" aria-hidden />
                  편집
                </Link>
              )}
            </div>
            {post.summary && <p className="text-muted-foreground">{post.summary}</p>}
          </header>

          <PostContent blocks={post.content} judgeUrlTemplate={judgeUrlTemplate} />

          {(prev || next) && (
            <nav
              aria-label="이전·다음 차시"
              className="mt-8 grid gap-3 border-t pt-6 sm:grid-cols-2 print:hidden"
            >
              {prev ? (
                <Link
                  href={href(prev)}
                  rel="prev"
                  className="flex items-center gap-2 rounded-xl border p-4 hover:bg-muted/50"
                >
                  <ChevronLeftIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-xs text-muted-foreground">
                      이전 차시{lessonLabel(prev) ? ` · ${lessonLabel(prev)}` : ""}
                    </span>
                    <span className="font-medium break-keep">{prev.title}</span>
                  </span>
                </Link>
              ) : (
                <span className="hidden sm:block" />
              )}
              {next && (
                <Link
                  href={href(next)}
                  rel="next"
                  className="flex items-center justify-end gap-2 rounded-xl border p-4 text-right hover:bg-muted/50"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="text-xs text-muted-foreground">
                      다음 차시{lessonLabel(next) ? ` · ${lessonLabel(next)}` : ""}
                    </span>
                    <span className="font-medium break-keep">{next.title}</span>
                  </span>
                  <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              )}
            </nav>
          )}
        </article>
      </div>
    </div>
  );
}
