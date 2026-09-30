import { expect, type Page, test } from "@playwright/test";

import { createGuardianToken } from "../lib/guardian/token";

import {
  adminClient,
  createTestUser,
  deleteTestUser,
  hasSupabase,
  loginAs,
  randomSuffix,
} from "./helpers/supabase";

test.describe("비로그인", () => {
  test("로그인 화면: 잘못된 이메일은 오류를 보여 준다", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
    await page.getByLabel("이메일").fill("not-an-email");
    await page.getByRole("button", { name: "로그인 코드 받기" }).click();
    await expect(page.getByText("올바른 이메일 주소를 입력해 주세요.")).toBeVisible();
  });

  test("로그인이 필요한 화면은 /login으로 보낸다", async ({ page }) => {
    await page.goto("/me");
    await expect(page).toHaveURL(/\/login\?next=%2Fme/);
  });

  test("헤더에 로그인 링크가 있다", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "로그인" }).first()).toBeVisible();
  });

  test("잘못된 보호자 동의 링크는 안내만 보여 준다", async ({ page }) => {
    await page.goto("/guardian/consent?token=invalid");
    await expect(page.getByText("올바르지 않은 링크입니다", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "동의합니다" })).toHaveCount(0);
  });
});

test.describe("로그인 후 가입", () => {
  test.skip(!hasSupabase, "Supabase 환경변수가 필요합니다");

  let user: { id: string; email: string };

  test.beforeEach(async ({ context, baseURL }) => {
    user = await createTestUser();
    await loginAs(context, user.email, baseURL!);
  });

  test.afterEach(async () => {
    if (user) await deleteTestUser(user.id);
  });

  async function fillCommon(page: Page, nickname: string) {
    await page.getByLabel("닉네임").fill(nickname);
    await page.getByLabel("위 내용을 확인했으며 동의합니다.").check();
  }

  test("가입 전이면 /signup으로 이동하고, 입력 오류 시 값이 유지된다", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/signup/);
    await page.getByLabel("닉네임").fill("e2e테스트");
    await page.getByRole("button", { name: "가입하기" }).click();
    await expect(page.getByText("만 14세 이상인지 선택해 주세요.")).toBeVisible();
    await expect(page.getByLabel("닉네임")).toHaveValue("e2e테스트");
  });

  test("학생 가입 → 헤더 표시 → 로그아웃", async ({ page }) => {
    const nickname = `학생${randomSuffix()}`;
    await page.goto("/signup");
    await fillCommon(page, nickname);
    await page.getByLabel("네, 만 14세 이상입니다").check();
    await page.getByRole("button", { name: "가입하기" }).click();

    await expect(page).toHaveURL(/\/$/);
    const accountButton = page.getByRole("button", { name: `내 계정: ${nickname}` });
    await expect(accountButton).toBeVisible();

    const { data: profile } = await adminClient()
      .from("profiles")
      .select("role, status, is_under_14, teacher_status")
      .eq("id", user.id)
      .single();
    expect(profile).toEqual({
      role: "student",
      status: "active",
      is_under_14: false,
      teacher_status: "none",
    });

    await accountButton.click();
    await page.getByRole("menuitem", { name: "로그아웃" }).click();
    await expect(page.getByRole("link", { name: "로그인" }).first()).toBeVisible();
  });

  test("교사 신청 가입 → 승인 대기", async ({ page }) => {
    await page.goto("/signup");
    await fillCommon(page, `교사${randomSuffix()}`);
    await page.getByLabel("네, 만 14세 이상입니다").check();
    await page.getByText("교사로 신청합니다").click();
    await page.getByLabel("소속 학교").fill("한빛중학교");
    await page.getByLabel("직급").selectOption("교사");
    await page.getByLabel("과목").fill("정보");
    await page.getByRole("button", { name: "가입하기" }).click();

    await expect(page).toHaveURL(/\/me\?notice=teacher_pending/);
    await expect(page.getByText("승인 대기 중")).toBeVisible();
    const { data } = await adminClient()
      .from("profiles")
      .select("role, teacher_status")
      .eq("id", user.id)
      .single();
    // 승인 전에는 학생 권한
    expect(data).toEqual({ role: "student", teacher_status: "pending" });
  });

  test("만 14세 미만 가입 → 동의 대기 배너 → 보호자 동의 → 활성화", async ({ page }) => {
    await page.goto("/signup");
    await fillCommon(page, `어린이${randomSuffix()}`);
    await page.getByLabel("아니요, 만 14세 미만입니다").check();
    // 14세 미만이면 교사 신청 항목이 없다
    await expect(page.getByText("교사로 신청합니다")).toHaveCount(0);
    await page.getByLabel("보호자 이메일").fill(`parent+${randomSuffix()}@example.com`);
    await page.getByRole("button", { name: "가입하기" }).click();

    await expect(page).toHaveURL(/\/me/);
    await expect(page.getByRole("region", { name: "보호자 동의 안내" })).toBeVisible();

    const admin = adminClient();
    const { data: sent } = await admin
      .from("guardian_consents")
      .select("token_hash")
      .eq("profile_id", user.id);
    // 토큰은 해시로만 저장된다
    expect(sent).toHaveLength(1);
    expect(sent![0].token_hash).toMatch(/^[0-9a-f]{64}$/);

    // 배너의 재발송은 60초 간격 제한에 걸린다.
    await page.getByRole("button", { name: "메일 재발송" }).click();
    await expect(page.getByText("초 뒤에 다시 보낼 수 있습니다", { exact: false })).toBeVisible();

    // 메일 원문 링크 대신 발송 함수로 새 토큰을 받는다(간격 제한 0초). 가입 때 보낸 토큰은 무효가 된다.
    const { token, tokenHash, expiresAt } = createGuardianToken(
      new Date(Date.now() + 60 * 60 * 1000),
    );
    const { data: issued } = await admin.rpc("issue_guardian_token", {
      p_profile_id: user.id,
      p_token_hash: tokenHash,
      p_expires_at: expiresAt.toISOString(),
      p_cooldown_seconds: 0,
      p_daily_limit: 5,
    });
    expect(issued).toBe("ok");
    const { data: tokens } = await admin
      .from("guardian_consents")
      .select("revoked_at")
      .eq("profile_id", user.id)
      .order("created_at");
    expect(tokens?.map((t) => t.revoked_at !== null)).toEqual([true, false]);

    const consentUrl = `/guardian/consent?token=${token}`;
    await page.goto(consentUrl);
    await expect(
      page.getByRole("heading", { name: "만 14세 미만 회원 가입 보호자 동의" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "동의합니다" }).click();
    await expect(page.getByText("동의 항목을 확인하고 체크해 주세요.")).toBeVisible();
    await page.getByLabel("법정대리인(보호자)으로서", { exact: false }).check();
    await page.getByRole("button", { name: "동의합니다" }).click();
    await expect(page.getByRole("heading", { name: "동의가 완료되었습니다" })).toBeVisible();

    // 1회용: 같은 링크를 다시 열면 완료 안내만 보인다
    await page.goto(consentUrl);
    await expect(page.getByText("이미 동의가 완료되었습니다.")).toBeVisible();

    const { data: profile } = await admin
      .from("profiles")
      .select("status, guardian_consented_at")
      .eq("id", user.id)
      .single();
    expect(profile?.status).toBe("active");
    expect(profile?.guardian_consented_at).not.toBeNull();

    await page.goto("/me");
    await expect(page.getByRole("region", { name: "보호자 동의 안내" })).toHaveCount(0);
  });

  test("회원 탈퇴 → 개인정보 삭제", async ({ page }) => {
    await page.goto("/signup");
    await fillCommon(page, `탈퇴${randomSuffix()}`);
    await page.getByLabel("네, 만 14세 이상입니다").check();
    await page.getByRole("button", { name: "가입하기" }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto("/me");
    await page.getByLabel("확인을 위해", { exact: false }).fill("탈퇴합니다");
    await page.getByRole("button", { name: "회원 탈퇴" }).click();
    await expect(page).toHaveURL(/withdrawn=1/);
    await expect(page.getByRole("link", { name: "로그인" }).first()).toBeVisible();

    const admin = adminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    expect(profile).toBeNull();
    const { data: authUser } = await admin.auth.admin.getUserById(user.id);
    expect(authUser.user).toBeNull();
  });
});
