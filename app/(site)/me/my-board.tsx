import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCompact } from "@/lib/board/format";
import { listMyBoardPosts, listMyComments, MY_LIST_LIMIT } from "@/lib/board/mine";

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeZone: "Asia/Seoul",
});

function Badge({ children, tone }: { children: React.ReactNode; tone: "muted" | "danger" }) {
  return (
    <span
      className={
        tone === "danger"
          ? "rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-semibold text-destructive"
          : "rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground"
      }
    >
      {children}
    </span>
  );
}

/** /me 내 글·내 댓글(F-08). 최근 50개씩, 휴지통·숨김 상태 표시. */
export async function MyBoardActivity({ userId }: { userId: string }) {
  const [posts, comments] = await Promise.all([listMyBoardPosts(userId), listMyComments(userId)]);
  const empty = <p className="text-sm text-muted-foreground">아직 없습니다.</p>;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>내 글</h2>
          </CardTitle>
          <CardDescription>
            게시판에 쓴 글 최근 {MY_LIST_LIMIT}개. 휴지통의 글은 30일 뒤 영구 삭제됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {posts.length === 0 ? (
            empty
          ) : (
            <ul aria-label="내 글 목록" className="flex flex-col divide-y">
              {posts.map((p) => (
                <li key={p.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                  <p className="flex flex-wrap items-center gap-1.5">
                    {p.status === "trashed" && <Badge tone="muted">휴지통</Badge>}
                    {p.status === "hidden" && <Badge tone="danger">관리자가 숨김</Badge>}
                    {p.href ? (
                      <Link href={p.href} className="font-medium break-keep hover:underline">
                        {p.title}
                      </Link>
                    ) : (
                      <span className="font-medium break-keep text-muted-foreground">
                        {p.title}
                      </span>
                    )}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    {p.boardTitle && <span>{p.boardTitle}</span>}
                    <span aria-hidden>·</span>
                    <span>{dateFormatter.format(new Date(p.createdAt))}</span>
                    <span aria-hidden>·</span>
                    <span>점수 {formatCompact(p.score)}</span>
                    <span aria-hidden>·</span>
                    <span>댓글 {formatCompact(p.commentCount)}</span>
                    {p.deletedAt && (
                      <span>· {dateFormatter.format(new Date(p.deletedAt))} 삭제</span>
                    )}
                    {p.href && (
                      <Link
                        href={`${p.href}/edit`}
                        className="ml-auto font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        수정
                      </Link>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>내 댓글</h2>
          </CardTitle>
          <CardDescription>최근 {MY_LIST_LIMIT}개(삭제한 댓글 제외)</CardDescription>
        </CardHeader>
        <CardContent>
          {comments.length === 0 ? (
            empty
          ) : (
            <ul aria-label="내 댓글 목록" className="flex flex-col divide-y">
              {comments.map((c) => (
                <li key={c.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm break-all">
                    {c.hidden && <Badge tone="danger">관리자가 숨김</Badge>}
                    {c.excerpt}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.href ? (
                      <Link href={c.href} className="hover:underline">
                        {c.postTitle}
                      </Link>
                    ) : (
                      c.postTitle
                    )}{" "}
                    · {dateFormatter.format(new Date(c.createdAt))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
