import { z } from "zod";

/** 신고 사유(DB reports.reason check 제약과 같게 유지) */
export const REPORT_REASONS = ["spam", "abuse", "privacy", "inappropriate", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const reportReasonLabels: Record<ReportReason, string> = {
  spam: "스팸·광고",
  abuse: "욕설·비방",
  privacy: "개인정보 노출",
  inappropriate: "부적절한 내용",
  other: "기타",
};

export const REPORT_DETAIL_MAX = 500;

export const reportInputSchema = z.object({
  targetType: z.enum(["post", "comment"]),
  targetId: z.uuid(),
  reason: z.enum(REPORT_REASONS, { error: "신고 사유를 골라 주세요." }),
  detail: z
    .string()
    .trim()
    .max(REPORT_DETAIL_MAX, `자세한 내용은 ${REPORT_DETAIL_MAX}자 이하여야 합니다.`)
    .optional()
    .transform((v) => (v ? v : null)),
});

export type ReportRow = {
  id: string;
  reporter_id: string | null;
  target_type: string;
  target_id: string;
  reason: string;
  detail: string | null;
  status: string;
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
};

export type ReportGroup = {
  targetType: "post" | "comment";
  targetId: string;
  /** 처리할 때 넘길 신고 하나(resolve_report는 같은 대상의 열린 신고를 모두 처리한다) */
  reportId: string;
  count: number;
  reasons: { reason: ReportReason; count: number }[];
  latestAt: string;
  reports: ReportRow[];
};

/**
 * 열린 신고를 대상(글·댓글)별로 묶는다. 신고가 많은 대상 → 최근 신고 순.
 * 사유별 건수는 많은 순(같으면 사유 목록 순서).
 */
export function groupReports(rows: ReportRow[]): ReportGroup[] {
  const groups = new Map<string, ReportGroup>();
  for (const row of rows) {
    if (row.target_type !== "post" && row.target_type !== "comment") continue;
    const key = `${row.target_type}:${row.target_id}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        targetType: row.target_type,
        targetId: row.target_id,
        reportId: row.id,
        count: 0,
        reasons: [],
        latestAt: row.created_at,
        reports: [],
      };
      groups.set(key, group);
    }
    group.count++;
    group.reports.push(row);
    if (row.created_at > group.latestAt) group.latestAt = row.created_at;
  }

  const order = (r: ReportReason) => REPORT_REASONS.indexOf(r);
  return [...groups.values()]
    .map((group) => {
      const counts = new Map<ReportReason, number>();
      for (const r of group.reports) {
        const reason = (REPORT_REASONS as readonly string[]).includes(r.reason)
          ? (r.reason as ReportReason)
          : "other";
        counts.set(reason, (counts.get(reason) ?? 0) + 1);
      }
      return {
        ...group,
        reports: [...group.reports].sort((a, b) => b.created_at.localeCompare(a.created_at)),
        reasons: [...counts]
          .map(([reason, count]) => ({ reason, count }))
          .sort((a, b) => b.count - a.count || order(a.reason) - order(b.reason)),
      };
    })
    .sort((a, b) => b.count - a.count || b.latestAt.localeCompare(a.latestAt));
}
