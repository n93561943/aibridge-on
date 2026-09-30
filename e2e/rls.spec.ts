import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  adminClient,
  createMember,
  deleteTestUser,
  hasSupabase,
  userClient,
} from "./helpers/supabase";

// DB 권한(RLS)만 검사하므로 브라우저·화면 크기와 무관하다. 데스크톱 프로젝트에서만 실행한다.
test.describe("RLS: profiles·guardian_consents·otp_attempts", () => {
  test.skip(({ isMobile }) => isMobile || !hasSupabase, "데스크톱 + Supabase 환경에서만");

  let a: { id: string; email: string };
  let b: { id: string; email: string };

  test.beforeAll(async () => {
    a = await createMember();
    b = await createMember({
      is_under_14: true,
      guardian_email: "p@example.com",
      status: "pending_guardian",
    });
    await adminClient()
      .from("guardian_consents")
      .insert({
        profile_id: b.id,
        guardian_email: "p@example.com",
        token_hash: `rls-test-${b.id}`,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      });
  });

  test.afterAll(async () => {
    if (a) await deleteTestUser(a.id);
    if (b) await deleteTestUser(b.id);
  });

  test("비회원(anon)은 어떤 테이블도 읽을 수 없다", async () => {
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    for (const table of ["profiles", "guardian_consents", "otp_attempts"]) {
      const { data, error } = await anon.from(table).select("*");
      expect(error ?? data?.length === 0, `${table}는 차단돼야 함`).toBeTruthy();
      expect(data ?? []).toHaveLength(0);
    }
  });

  test("회원은 본인 프로필만 읽을 수 있다", async () => {
    const client = await userClient(a.email);
    const { data } = await client.from("profiles").select("id");
    expect(data?.map((r) => r.id)).toEqual([a.id]);
  });

  test("회원은 역할·상태·14세·보호자 컬럼을 바꿀 수 없다", async () => {
    const client = await userClient(b.email);
    for (const patch of [
      { role: "admin" },
      { status: "active" },
      { is_under_14: false },
      { teacher_status: "approved" },
      { guardian_consented_at: new Date().toISOString() },
    ]) {
      const { error } = await client.from("profiles").update(patch).eq("id", b.id);
      expect(error, `${Object.keys(patch)[0]} 변경은 거부돼야 함`).not.toBeNull();
    }
    const { data } = await adminClient()
      .from("profiles")
      .select("role, status, is_under_14, teacher_status, guardian_consented_at")
      .eq("id", b.id)
      .single();
    expect(data).toEqual({
      role: "student",
      status: "pending_guardian",
      is_under_14: true,
      teacher_status: "none",
      guardian_consented_at: null,
    });
  });

  test("회원은 닉네임은 바꿀 수 있지만 다른 사람 프로필은 못 바꾼다", async () => {
    const client = await userClient(a.email);
    const { error } = await client
      .from("profiles")
      .update({ nickname: "바뀐닉네임" })
      .eq("id", a.id);
    expect(error).toBeNull();

    const { data: others } = await client
      .from("profiles")
      .update({ nickname: "해킹" })
      .eq("id", b.id)
      .select("id");
    expect(others ?? []).toHaveLength(0);
  });

  test("회원은 프로필을 직접 만들거나 지울 수 없다", async () => {
    const client = await userClient(a.email);
    const { error: insertError } = await client.from("profiles").insert({
      id: a.id,
      email: a.email,
      nickname: "중복",
      is_under_14: false,
      privacy_agreed_at: new Date().toISOString(),
    });
    expect(insertError).not.toBeNull();
    const { error: deleteError } = await client.from("profiles").delete().eq("id", a.id);
    expect(deleteError).not.toBeNull();
  });

  test("회원은 보호자 동의 기록·OTP 기록에 접근할 수 없다", async () => {
    const client = await userClient(b.email);
    const { data: consents, error: consentError } = await client
      .from("guardian_consents")
      .select("*");
    expect(consentError).not.toBeNull();
    expect(consents ?? []).toHaveLength(0);
    const { error: otpError } = await client.from("otp_attempts").select("*");
    expect(otpError).not.toBeNull();
  });

  test("정지된 관리자는 관리자 권한(전체 조회)을 잃는다", async () => {
    const admin = await createMember({ role: "admin", status: "suspended" });
    try {
      const client = await userClient(admin.email);
      const { data } = await client.from("profiles").select("id");
      expect(data?.map((r) => r.id)).toEqual([admin.id]);
    } finally {
      await deleteTestUser(admin.id);
    }
  });

  test("활성 관리자는 전체 프로필을 조회할 수 있다", async () => {
    const admin = await createMember({ role: "admin" });
    try {
      const client = await userClient(admin.email);
      const { data } = await client.from("profiles").select("id");
      const ids = data?.map((r) => r.id) ?? [];
      expect(ids).toEqual(expect.arrayContaining([a.id, b.id, admin.id]));
    } finally {
      await deleteTestUser(admin.id);
    }
  });
});
