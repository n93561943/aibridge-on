import { expect, test } from "@playwright/test";

import { sha256Hex } from "../lib/hash";
import { createGuardianToken, hashGuardianToken } from "../lib/guardian/token";

import {
  adminClient,
  createMember,
  deleteTestUser,
  hasSupabase,
  randomSuffix,
} from "./helpers/supabase";

// 개인정보(만 14세 미만) 처리 DB 함수 검증. 화면과 무관하므로 데스크톱 프로젝트에서만 실행한다.
test.describe("보호자 동의·OTP DB 함수", () => {
  test.skip(({ isMobile }) => isMobile || !hasSupabase, "데스크톱 + Supabase 환경에서만");

  const DAY = 24 * 60 * 60 * 1000;
  const created: string[] = [];

  test.afterAll(async () => {
    for (const id of created) await deleteTestUser(id);
  });

  async function pendingMember(overrides: Record<string, unknown> = {}) {
    const user = await createMember({
      is_under_14: true,
      guardian_email: "parent@example.com",
      status: "pending_guardian",
      ...overrides,
    });
    created.push(user.id);
    return user;
  }

  function issue(profileId: string, cooldownSeconds = 60, expiresAt = new Date(Date.now() + DAY)) {
    const { token, tokenHash } = createGuardianToken(expiresAt);
    const call = adminClient().rpc("issue_guardian_token", {
      p_profile_id: profileId,
      p_token_hash: tokenHash,
      p_expires_at: expiresAt.toISOString(),
      p_cooldown_seconds: cooldownSeconds,
      p_daily_limit: 5,
    });
    return { token, call };
  }

  async function activeTokens(profileId: string) {
    const { data } = await adminClient()
      .from("guardian_consents")
      .select("id")
      .eq("profile_id", profileId)
      .is("consented_at", null)
      .is("revoked_at", null);
    return data ?? [];
  }

  test("동시에 10번 재발송해도 1번만 발급되고 유효 토큰은 1개", async () => {
    const user = await pendingMember();
    const results = await Promise.all(Array.from({ length: 10 }, () => issue(user.id).call));
    const statuses = results.map((r) => r.data);
    expect(statuses.filter((s) => s === "ok")).toHaveLength(1);
    expect(statuses.filter((s) => typeof s === "string" && s.startsWith("cooldown:"))).toHaveLength(
      9,
    );
    expect(await activeTokens(user.id)).toHaveLength(1);
  });

  test("하루 5회를 넘으면 daily_limit", async () => {
    const user = await pendingMember();
    for (let i = 0; i < 5; i++) expect((await issue(user.id, 0).call).data).toBe("ok");
    expect((await issue(user.id, 0).call).data).toBe("daily_limit");
  });

  test("재발송하면 이전 토큰은 무효(revoked)가 되고 새 토큰만 동의에 쓸 수 있다", async () => {
    const user = await pendingMember();
    const first = issue(user.id, 0);
    expect((await first.call).data).toBe("ok");
    const second = issue(user.id, 0);
    expect((await second.call).data).toBe("ok");

    const admin = adminClient();
    const r1 = await admin.rpc("give_guardian_consent", {
      p_token_hash: hashGuardianToken(first.token),
    });
    expect(r1.data).toBe("revoked");
    const r2 = await admin.rpc("give_guardian_consent", {
      p_token_hash: hashGuardianToken(second.token),
    });
    expect(r2.data).toBe("ok");
    // 1회용
    const r3 = await admin.rpc("give_guardian_consent", {
      p_token_hash: hashGuardianToken(second.token),
    });
    expect(r3.data).toBe("used");

    const { data: profile } = await admin
      .from("profiles")
      .select("status")
      .eq("id", user.id)
      .single();
    expect(profile?.status).toBe("active");
  });

  test("만료된 토큰으로는 동의할 수 없고 계정은 대기 상태로 남는다", async () => {
    const user = await pendingMember();
    const t = issue(user.id, 0);
    expect((await t.call).data).toBe("ok");
    const admin = adminClient();
    await admin
      .from("guardian_consents")
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("token_hash", hashGuardianToken(t.token));

    const r = await admin.rpc("give_guardian_consent", {
      p_token_hash: hashGuardianToken(t.token),
    });
    expect(r.data).toBe("expired");
    const { data: profile } = await admin
      .from("profiles")
      .select("status")
      .eq("id", user.id)
      .single();
    expect(profile?.status).toBe("pending_guardian");
  });

  test("삭제 기한이 지난 계정에는 새 토큰을 발급하지 않는다", async () => {
    const user = await pendingMember();
    expect((await issue(user.id, 0, new Date(Date.now() - 1000)).call).data).toBe("expired");
  });

  test("동의 대기 상태가 아니면 발급하지 않는다", async () => {
    const user = await createMember();
    created.push(user.id);
    expect((await issue(user.id, 0).call).data).toBe("not_pending");
  });

  test("7일 자동 삭제: 기한 지난 동의 대기 계정만 지운다", async () => {
    const admin = adminClient();
    const eightDaysAgo = new Date(Date.now() - 8 * DAY).toISOString();
    const expired = await pendingMember();
    const fresh = await pendingMember();
    const consented = await pendingMember();
    await admin.from("profiles").update({ created_at: eightDaysAgo }).eq("id", expired.id);
    await admin
      .from("profiles")
      .update({
        created_at: eightDaysAgo,
        status: "active",
        guardian_consented_at: new Date().toISOString(),
      })
      .eq("id", consented.id);

    const { error } = await admin.rpc("purge_expired_accounts");
    expect(error).toBeNull();

    const { data: expiredUser } = await admin.auth.admin.getUserById(expired.id);
    expect(expiredUser.user).toBeNull();
    const { data: left } = await admin
      .from("profiles")
      .select("id")
      .in("id", [expired.id, fresh.id, consented.id]);
    expect(left?.map((r) => r.id).sort()).toEqual([fresh.id, consented.id].sort());
  });

  test("로그인 코드 시도 차감은 동시 요청에도 정확히 누적된다", async () => {
    const admin = adminClient();
    const hash = sha256Hex(`otp:e2e-${randomSuffix()}@example.com`);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => admin.rpc("consume_otp_attempt", { p_email_hash: hash })),
    );
    expect(results.map((r) => r.data).sort((a, b) => Number(a) - Number(b))).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
    const refund = await admin.rpc("consume_otp_attempt", { p_email_hash: hash, p_delta: -1 });
    expect(refund.data).toBe(19);
    await admin.from("otp_attempts").delete().eq("email_hash", hash);
  });
});
