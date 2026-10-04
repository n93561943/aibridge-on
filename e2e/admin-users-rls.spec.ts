import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  adminClient,
  createMember,
  deleteTestUser,
  hasSupabase,
  userClient,
} from "./helpers/supabase";

type User = { id: string; email: string };

const TEACHER_INFO = {
  teacher_school: "테스트학교",
  teacher_position: "교사",
  teacher_subject: "정보",
};

/*
 * P6 관리자 RPC(admin_review_teachers·admin_set_role·admin_set_status·admin_prepare_withdraw·
 * admin_log_guardian_resend)와 감사 로그 RLS. 만 14세 미만 등급 제한을 포함한다.
 */
test.describe.serial("RLS: 회원 관리 RPC·감사 로그", () => {
  test.skip(({ isMobile }) => isMobile || !hasSupabase, "데스크톱 + Supabase 환경에서만");

  const users: User[] = [];
  let admin: User;
  let student: User;
  let applicant: User;
  let applicant2: User;
  let child: User; // 만 14세 미만(동의 완료)
  let waiting: User; // 보호자 동의 대기
  let adminDb: SupabaseClient;
  let studentDb: SupabaseClient;
  const db = () => adminClient();

  async function member(overrides: Record<string, unknown> = {}) {
    const user = await createMember(overrides);
    users.push(user);
    return user;
  }
  const profile = async (id: string) =>
    (await db().from("profiles").select("*").eq("id", id).single()).data!;

  test.beforeAll(async ({}, testInfo) => {
    if (testInfo.project.name === "mobile" || !hasSupabase) return;
    admin = await member({ role: "admin" });
    student = await member();
    applicant = await member({
      ...TEACHER_INFO,
      teacher_status: "pending",
      teacher_requested_at: new Date().toISOString(),
    });
    applicant2 = await member({
      ...TEACHER_INFO,
      teacher_status: "pending",
      teacher_requested_at: new Date().toISOString(),
    });
    child = await member({
      is_under_14: true,
      guardian_email: "p@example.com",
      guardian_consented_at: new Date().toISOString(),
    });
    waiting = await member({
      is_under_14: true,
      guardian_email: "p@example.com",
      status: "pending_guardian",
    });
    adminDb = await userClient(admin.email);
    studentDb = await userClient(student.email);
  });

  test.afterAll(async () => {
    const ids = users.map((u) => u.id);
    if (ids.length) await db().from("admin_audit_logs").delete().in("target_user_id", ids);
    for (const u of users) await deleteTestUser(u.id);
  });

  test("관리자가 아니면 모든 관리자 RPC가 거부되고 감사 로그도 못 본다", async () => {
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    for (const client of [studentDb, anon]) {
      expect(
        (await client.rpc("admin_set_role", { p_user: applicant.id, p_role: "admin" })).error,
      ).not.toBeNull();
      expect(
        (await client.rpc("admin_set_status", { p_user: applicant.id, p_status: "suspended" }))
          .error,
      ).not.toBeNull();
      expect(
        (await client.rpc("admin_review_teachers", { p_ids: [applicant.id], p_approve: true }))
          .error,
      ).not.toBeNull();
      expect(
        (await client.rpc("admin_prepare_withdraw", { p_user: applicant.id })).error,
      ).not.toBeNull();
    }
    const { error } = await studentDb.rpc("admin_set_role", {
      p_user: student.id,
      p_role: "admin",
    });
    expect(error?.code).toBe("42501");
    expect((await profile(student.id)).role).toBe("student");
    // 회원이 직접 역할 컬럼을 바꾸는 것도 막혀 있다(P1 컬럼 권한)
    await studentDb.from("profiles").update({ role: "admin" }).eq("id", student.id);
    expect((await profile(student.id)).role).toBe("student");
    const { data: logs } = await studentDb.from("admin_audit_logs").select("id");
    expect(logs ?? []).toEqual([]);
  });

  test("교사 심사: 반려는 사유 필수, 승인·반려 결과와 이력이 남는다", async () => {
    const noReason = await adminDb.rpc("admin_review_teachers", {
      p_ids: [applicant2.id],
      p_approve: false,
    });
    expect(noReason.error?.code).toBe("22023");

    const approved = await adminDb.rpc("admin_review_teachers", {
      p_ids: [applicant.id, student.id], // 신청하지 않은 회원은 건너뛴다
      p_approve: true,
    });
    expect(approved.error).toBeNull();
    expect(approved.data).toEqual([
      {
        id: applicant.id,
        email: applicant.email,
        nickname: (await profile(applicant.id)).nickname,
      },
    ]);
    expect(await profile(applicant.id)).toMatchObject({
      role: "teacher",
      teacher_status: "approved",
    });
    expect((await profile(student.id)).role).toBe("student");

    const rejected = await adminDb.rpc("admin_review_teachers", {
      p_ids: [applicant2.id],
      p_approve: false,
      p_reason: "재직 증빙이 필요합니다",
    });
    expect(rejected.error).toBeNull();
    expect(await profile(applicant2.id)).toMatchObject({
      role: "student",
      teacher_status: "rejected",
      teacher_reject_reason: "재직 증빙이 필요합니다",
    });

    const { data: logs } = await adminDb
      .from("admin_audit_logs")
      .select("action, actor_id, detail")
      .in("target_user_id", [applicant.id, applicant2.id])
      .order("id");
    expect(logs).toEqual([
      { action: "teacher_approve", actor_id: admin.id, detail: {} },
      {
        action: "teacher_reject",
        actor_id: admin.id,
        detail: { reason: "재직 증빙이 필요합니다" },
      },
    ]);
  });

  test("등급: 자기 자신 불가, 만 14세 미만은 학생만, 교사→학생이면 다시 신청할 수 있게", async () => {
    expect(
      (await adminDb.rpc("admin_set_role", { p_user: admin.id, p_role: "student" })).error?.code,
    ).toBe("42501");
    expect(
      (await adminDb.rpc("admin_set_role", { p_user: child.id, p_role: "teacher" })).error?.code,
    ).toBe("23514");
    expect(
      (await adminDb.rpc("admin_set_role", { p_user: child.id, p_role: "admin" })).error?.code,
    ).toBe("23514");
    expect((await profile(child.id)).role).toBe("student");

    expect(
      (await adminDb.rpc("admin_set_role", { p_user: applicant.id, p_role: "student" })).error,
    ).toBeNull();
    expect(await profile(applicant.id)).toMatchObject({ role: "student", teacher_status: "none" });
    const { data: log } = await adminDb
      .from("admin_audit_logs")
      .select("detail")
      .eq("target_user_id", applicant.id)
      .eq("action", "role_change")
      .single();
    expect(log?.detail).toEqual({ from: "teacher", to: "student" });
  });

  test("상태: 정지하면 활동 기능이 막히고, 동의 대기·자기 자신은 바꿀 수 없다", async () => {
    expect(
      (await adminDb.rpc("admin_set_status", { p_user: student.id, p_status: "suspended" })).error,
    ).toBeNull();
    expect((await profile(student.id)).status).toBe("suspended");
    // 정지된 회원은 is_active_member가 거짓 → 투표·신고·글쓰기 RLS에 막힌다
    const { data: active } = await studentDb.rpc("is_active_member");
    expect(active).toBe(false);

    expect(
      (await adminDb.rpc("admin_set_status", { p_user: student.id, p_status: "active" })).error,
    ).toBeNull();
    expect((await profile(student.id)).status).toBe("active");

    expect(
      (await adminDb.rpc("admin_set_status", { p_user: waiting.id, p_status: "active" })).error
        ?.code,
    ).toBe("23514");
    expect((await profile(waiting.id)).status).toBe("pending_guardian");
    expect(
      (await adminDb.rpc("admin_set_status", { p_user: admin.id, p_status: "suspended" })).error
        ?.code,
    ).toBe("42501");
  });

  test("강제 탈퇴 준비·보호자 재발송 기록: 규칙 검사", async () => {
    expect((await adminDb.rpc("admin_prepare_withdraw", { p_user: admin.id })).error?.code).toBe(
      "42501",
    );
    expect(
      (await adminDb.rpc("admin_log_guardian_resend", { p_user: student.id })).error?.code,
    ).toBe("23514");
    expect(
      (await adminDb.rpc("admin_log_guardian_resend", { p_user: waiting.id })).error,
    ).toBeNull();
    expect(
      (await adminDb.rpc("admin_prepare_withdraw", { p_user: applicant2.id })).error,
    ).toBeNull();
    const { data: logs } = await adminDb
      .from("admin_audit_logs")
      .select("action, target_user_id")
      .in("target_user_id", [waiting.id, applicant2.id])
      .in("action", ["guardian_resend", "force_withdraw"])
      .order("id");
    expect(logs).toEqual([
      { action: "guardian_resend", target_user_id: waiting.id },
      { action: "force_withdraw", target_user_id: applicant2.id },
    ]);
  });
});
