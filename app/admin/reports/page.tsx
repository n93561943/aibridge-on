import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth/current-user";
import { reportReasonLabels } from "@/lib/board/report";
import {
  type AdminReportGroup,
  listOpenReportGroups,
  listResolvedReports,
  type ReportTarget,
  type ResolvedReportItem,
} from "@/lib/board/reports-admin";
import { cn } from "@/lib/utils";

import { ResolveButtons, UnhideButton } from "./report-buttons";

export const metadata: Metadata = { title: "신고" };

const dateTime = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Seoul",
});

function TargetPreview({
  type,
  target,
}: {
  type: "post" | "comment";
  target: ReportTarget | null;
}) {
  if (!target) {
    return <p className="text-sm text-muted-foreground">영구 삭제되어 찾을 수 없습니다.</p>;
  }
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">
          {type === "post" ? "글" : "댓글"}
        </span>
        <span>작성자 {target.author}</span>
        {target.hidden && <span className="font-medium text-destructive">· 숨김 상태</span>}
        {target.deleted && <span>· 삭제됨</span>}
      </p>
      <p className="font-semibold break-keep">
        {target.href ? (
          <Link href={target.href} target="_blank" className="hover:underline">
            {target.postTitle}
          </Link>
        ) : (
          target.postTitle
        )}
      </p>
      {target.excerpt && (
        <p className="line-clamp-3 rounded-lg bg-muted/60 px-3 py-2 text-sm break-all whitespace-pre-wrap">
          {target.excerpt}
        </p>
      )}
    </div>
  );
}

function targetLabel(group: { targetType: "post" | "comment"; target: ReportTarget | null }) {
  const kind = group.targetType === "post" ? "글" : "댓글";
  return `${kind} ${group.target?.postTitle ?? ""}`.trim();
}

function OpenReport({ group }: { group: AdminReportGroup }) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <TargetPreview type={group.targetType} target={group.target} />
        <span className="shrink-0 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">
          신고 {group.count}건
        </span>
      </div>
      <p className="flex flex-wrap gap-1.5 text-xs">
        {group.reasons.map((r) => (
          <span key={r.reason} className="rounded-full border px-2 py-0.5">
            {reportReasonLabels[r.reason]} {r.count}
          </span>
        ))}
      </p>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">신고 내용 보기</summary>
        <ul className="mt-2 flex flex-col gap-2">
          {group.reports.map((r) => (
            <li key={r.id} className="rounded-lg bg-muted/50 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                {(r.reporter_id && group.reporters.get(r.reporter_id)) || "알 수 없음"} ·{" "}
                {reportReasonLabels[r.reason as keyof typeof reportReasonLabels] ?? r.reason} ·{" "}
                {dateTime.format(new Date(r.created_at))}
              </p>
              {r.detail && <p className="mt-1 break-all whitespace-pre-wrap">{r.detail}</p>}
            </li>
          ))}
        </ul>
      </details>
      <ResolveButtons reportId={group.reportId} label={targetLabel(group)} />
    </li>
  );
}

function ResolvedReport({ item }: { item: ResolvedReportItem }) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-background p-4">
      <TargetPreview type={item.targetType} target={item.target} />
      <p className="text-xs text-muted-foreground">
        <span
          className={cn(
            "mr-1.5 rounded px-1.5 py-0.5 font-semibold",
            item.resolution === "hidden"
              ? "bg-destructive/10 text-destructive"
              : "bg-muted text-foreground",
          )}
        >
          {item.resolution === "hidden" ? "숨김" : "유지"}
        </span>
        신고 {item.count}건 · {item.resolvedBy} · {dateTime.format(new Date(item.resolvedAt))}
      </p>
      {item.target?.hidden && (
        <UnhideButton
          targetType={item.targetType}
          targetId={item.targetId}
          label={targetLabel(item)}
        />
      )}
    </li>
  );
}

/** 신고 처리(F-08): 처리 대기(대상별 묶음, 숨김·유지) / 처리 완료(최근 50건, 숨김 해제) */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAdmin("/admin/reports");
  const resolved = (await searchParams).tab === "resolved";

  const tabClass = (active: boolean) =>
    cn(
      "rounded-full px-3 py-1.5 text-sm font-medium",
      active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
    );

  return (
    <div className="container-site flex max-w-3xl flex-col gap-6 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">신고</h1>
        <p className="text-sm text-muted-foreground">
          숨기면 사이트에서 보이지 않고, 같은 대상의 신고가 모두 처리됩니다.
        </p>
      </header>
      <nav aria-label="신고 상태" className="flex gap-1">
        <Link
          href="/admin/reports"
          aria-current={!resolved ? "page" : undefined}
          className={tabClass(!resolved)}
        >
          처리 대기
        </Link>
        <Link
          href="/admin/reports?tab=resolved"
          aria-current={resolved ? "page" : undefined}
          className={tabClass(resolved)}
        >
          처리 완료
        </Link>
      </nav>
      {resolved ? <ResolvedList /> : <OpenList />}
    </div>
  );
}

async function OpenList() {
  const groups = await listOpenReportGroups();
  if (!groups.length) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        처리할 신고가 없습니다.
      </p>
    );
  }
  return (
    <ul aria-label="처리 대기 신고" className="flex flex-col gap-3">
      {groups.map((g) => (
        <OpenReport key={`${g.targetType}:${g.targetId}`} group={g} />
      ))}
    </ul>
  );
}

async function ResolvedList() {
  const items = await listResolvedReports();
  if (!items.length) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
        처리한 신고가 없습니다.
      </p>
    );
  }
  return (
    <ul aria-label="처리 완료 신고" className="flex flex-col gap-3">
      {items.map((item) => (
        <ResolvedReport key={`${item.targetType}:${item.targetId}`} item={item} />
      ))}
    </ul>
  );
}
