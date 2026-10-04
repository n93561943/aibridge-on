import { describe, expect, it } from "vitest";

import { groupReports, reportInputSchema, type ReportRow } from "./report";

const POST = "11111111-1111-4111-8111-111111111111";
const COMMENT = "22222222-2222-4222-8222-222222222222";

function row(id: string, values: Partial<ReportRow>): ReportRow {
  return {
    id,
    reporter_id: "u",
    target_type: "post",
    target_id: POST,
    reason: "spam",
    detail: null,
    status: "open",
    resolution: null,
    resolved_by: null,
    resolved_at: null,
    created_at: "2026-10-04T00:00:00Z",
    ...values,
  };
}

describe("신고 입력", () => {
  it("사유는 정해진 값만, 자세한 내용은 500자·빈 값은 null", () => {
    const ok = reportInputSchema.parse({
      targetType: "comment",
      targetId: COMMENT,
      reason: "abuse",
      detail: "  ",
    });
    expect(ok.detail).toBeNull();
    expect(
      reportInputSchema.safeParse({ targetType: "post", targetId: POST, reason: "hate" }).success,
    ).toBe(false);
    expect(
      reportInputSchema.safeParse({
        targetType: "post",
        targetId: POST,
        reason: "other",
        detail: "가".repeat(501),
      }).success,
    ).toBe(false);
    expect(
      reportInputSchema.safeParse({ targetType: "user", targetId: POST, reason: "spam" }).success,
    ).toBe(false);
  });
});

describe("신고 묶기", () => {
  it("대상별로 묶고 신고 많은 순 → 최근 순, 사유는 많은 순", () => {
    const groups = groupReports([
      row("a", { reason: "abuse", created_at: "2026-10-04T01:00:00Z" }),
      row("b", { reason: "spam", created_at: "2026-10-04T03:00:00Z" }),
      row("c", { reason: "abuse", created_at: "2026-10-04T02:00:00Z" }),
      row("d", {
        target_type: "comment",
        target_id: COMMENT,
        reason: "privacy",
        created_at: "2026-10-04T05:00:00Z",
      }),
    ]);
    expect(groups.map((g) => [g.targetType, g.count])).toEqual([
      ["post", 3],
      ["comment", 1],
    ]);
    expect(groups[0].reasons).toEqual([
      { reason: "abuse", count: 2 },
      { reason: "spam", count: 1 },
    ]);
    expect(groups[0].latestAt).toBe("2026-10-04T03:00:00Z");
    expect(groups[0].reports.map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(groups[0].reportId).toBe("a");
  });

  it("건수가 같으면 최근 신고가 있는 대상이 먼저", () => {
    const groups = groupReports([
      row("a", { created_at: "2026-10-04T01:00:00Z" }),
      row("b", { target_type: "comment", target_id: COMMENT, created_at: "2026-10-04T09:00:00Z" }),
    ]);
    expect(groups.map((g) => g.targetType)).toEqual(["comment", "post"]);
  });
});
