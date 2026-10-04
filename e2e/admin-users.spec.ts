import { expect, test } from "@playwright/test";

import {
  adminClient,
  createMember,
  deleteTestUser,
  hasSupabase,
  loginAs,
  randomSuffix,
} from "./helpers/supabase";

const TEACHER_INFO = {
  teacher_school: "테스트학교",
  teacher_position: "교사",
  teacher_subject: "정보",
};

/** 회원 관리 화면(F-03, P6): 대시보드·교사 일괄 승인·검색·등급·정지·보호자 재발송·강제 탈퇴 */
test.describe("관리자 회원 관리", () => {
  test.skip(!hasSupabase, "Supabase 환경변수가 필요합니다");
  test.describe.configure({ mode: "default" });

  const tag = randomSuffix().slice(0, 4);
  const nick = (name: string) => `${name}${tag}`;
  const users: string[] = [];
  const db = () => adminClient();

  async function member(overrides: Record<string, unknown> = {}) {
    const user = await createMember(overrides);
    users.push(user.id);
    return user;
  }
  const profile = async (id: string) =>
    (await db().from("profiles").select("*").eq("id", id).maybeSingle()).data;

  test.afterAll(async () => {
    if (users.length) await db().from("admin_audit_logs").delete().in("target_user_id", users);
    for (const id of users) await deleteTestUser(id);
  });

  test("대시보드·교사 일괄 승인·반려·검색", async ({ page, baseURL, isMobile }) => {
    test.skip(isMobile, "데스크톱에서만");
    const requested = {
      ...TEACHER_INFO,
      teacher_status: "pending",
      teacher_requested_at: new Date().toISOString(),
    };
    const t1 = await member({ ...requested, nickname: nick("선생가") });
    const t2 = await member({ ...requested, nickname: nick("선생나") });
    const t3 = await member({ ...requested, nickname: nick("선생다") });
    const admin = await member({ role: "admin", nickname: nick("관리") });
    await loginAs(page.context(), admin.email, baseURL!);

    // 대시보드와 관리자 메뉴 배지(다른 테스트 데이터가 있을 수 있어 3 이상)
    await page.goto("/admin");
    const pending = Number(await page.getByTestId("stat-교사 승인 대기").textContent());
    expect(pending).toBeGreaterThanOrEqual(3);
    await expect(
      page.getByRole("navigation", { name: "관리자 메뉴" }).getByRole("link", { name: /회원/ }),
    ).toContainText(String(pending));

    // 교사 승인 대기 탭: 두 명 골라 승인
    await page.goto("/admin/users?tab=teachers");
    await page.getByRole("checkbox", { name: `선택: ${nick("선생가")}` }).check();
    await page.getByRole("checkbox", { name: `선택: ${nick("선생나")}` }).check();
    await page.getByRole("button", { name: "선택 승인" }).click();
    await expect(page.getByRole("status").filter({ hasText: "2명을 승인했습니다" })).toBeVisible();
    expect((await profile(t1.id))?.role).toBe("teacher");
    expect((await profile(t2.id))?.role).toBe("teacher");

    // 반려(사유 필수)
    await page.getByRole("checkbox", { name: `선택: ${nick("선생다")}` }).check();
    await page.getByRole("button", { name: "선택 반려" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "반려하기" })).toBeDisabled();
    await dialog.getByLabel("반려 사유").fill("재직 증빙이 필요합니다");
    await dialog.getByRole("button", { name: "반려하기" }).click();
    await expect(page.getByRole("status").filter({ hasText: "1명을 반려했습니다" })).toBeVisible();
    expect(await profile(t3.id)).toMatchObject({
      teacher_status: "rejected",
      teacher_reject_reason: "재직 증빙이 필요합니다",
    });

    // 이 테스트 회원에만 붙은 태그로 검색: 승인된 두 명만 교사
    await page.goto(`/admin/users?q=${tag}&role=teacher`);
    const list = page.getByRole("list", { name: "회원 목록" });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(list).toContainText(nick("선생가"));
    await expect(list).not.toContainText(nick("선생다"));
  });

  test("등급·정지(회원에게 안내 배너)·이력, 강제 탈퇴", async ({
    page,
    browser,
    baseURL,
    isMobile,
  }) => {
    test.skip(isMobile, "데스크톱에서만");
    const target = await member({ nickname: nick("대상") });
    const child = await member({
      nickname: nick("어린이"),
      is_under_14: true,
      guardian_email: "p@example.com",
      guardian_consented_at: new Date().toISOString(),
    });
    const admin = await member({ role: "admin" });
    await loginAs(page.context(), admin.email, baseURL!);

    // 만 14세 미만은 교사·관리자를 고를 수 없다
    await page.goto(`/admin/users/${child.id}`);
    // <option>은 toBeDisabled로 판정되지 않아 속성으로 확인한다
    await expect(page.getByRole("option", { name: "교사" })).toHaveAttribute("disabled", "");
    await expect(page.getByRole("option", { name: "관리자" })).toHaveAttribute("disabled", "");

    // 등급 변경 → 이력
    await page.goto(`/admin/users/${target.id}`);
    await page.getByLabel("등급").selectOption("teacher");
    await page.getByRole("button", { name: "등급 저장" }).click();
    await expect(page.getByText("등급을 바꿨습니다.")).toBeVisible();
    const history = page.getByRole("list", { name: "관리 이력" });
    await expect(history).toContainText("등급 변경");
    await expect(history).toContainText("학생 → 교사");

    // 정지 → 회원 화면에 안내 배너
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "이용 정지" }).click();
    await expect(page.getByRole("button", { name: "정지 해제" })).toBeVisible();
    const context = await browser.newContext({ baseURL });
    try {
      await loginAs(context, target.email, baseURL!);
      const memberPage = await context.newPage();
      await memberPage.goto("/me");
      await expect(memberPage.getByRole("region", { name: "이용 정지 안내" })).toBeVisible();

      await page.getByRole("button", { name: "정지 해제" }).click();
      await expect(page.getByRole("button", { name: "이용 정지" })).toBeVisible();
      await memberPage.reload();
      await expect(memberPage.getByRole("region", { name: "이용 정지 안내" })).toHaveCount(0);
    } finally {
      await context.close();
    }

    // 강제 탈퇴: 닉네임을 입력해야 버튼이 켜진다
    const button = page.getByRole("button", { name: "강제 탈퇴" });
    await expect(button).toBeDisabled();
    await page.getByLabel(/확인을 위해 닉네임/).fill(nick("대상"));
    await button.click();
    await expect(page).toHaveURL(/\/admin\/users\?notice=withdrawn/);
    await expect(page.getByText("회원을 탈퇴시켰습니다.")).toBeVisible();
    expect(await profile(target.id)).toBeNull();
    const { data: logs } = await db()
      .from("admin_audit_logs")
      .select("action")
      .eq("target_user_id", target.id)
      .order("id");
    expect(logs?.map((l) => l.action)).toEqual([
      "role_change",
      "status_change",
      "status_change",
      "force_withdraw",
    ]);

    // 자기 자신은 바꿀 수 없다
    await page.goto(`/admin/users/${admin.id}`);
    await expect(page.getByText("내 계정입니다.")).toBeVisible();
    await expect(page.getByRole("button", { name: "이용 정지" })).toBeDisabled();
  });

  test("보호자 동의 대기: 목록과 메일 재발송", async ({ page, baseURL, isMobile }) => {
    test.skip(isMobile, "데스크톱에서만");
    const waiting = await member({
      nickname: nick("동의대기"),
      is_under_14: true,
      // Resend는 example.com 주소를 거부하므로 테스트 수신 주소를 쓴다.
      guardian_email: `delivered+${tag}@resend.dev`,
      status: "pending_guardian",
    });
    const admin = await member({ role: "admin" });
    await loginAs(page.context(), admin.email, baseURL!);
    await page.goto("/admin/users?tab=guardians");
    const item = page
      .getByRole("list", { name: "보호자 동의 대기" })
      .getByRole("listitem")
      .filter({ hasText: nick("동의대기") });
    await expect(item).toContainText(`delivered+${tag}@resend.dev`);
    await expect(item).toContainText("마지막 발송 없음");
    await item.getByRole("button", { name: `메일 재발송: ${nick("동의대기")}` }).click();
    await expect(item.getByRole("status")).toHaveText("보호자에게 동의 메일을 다시 보냈습니다.");
    const { count } = await db()
      .from("guardian_consents")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", waiting.id);
    expect(count).toBe(1);
  });

  test("390px에서 회원 화면이 넘치지 않는다", async ({ page, baseURL, isMobile }) => {
    test.skip(!isMobile, "모바일 전용");
    const admin = await member({ role: "admin" });
    await loginAs(page.context(), admin.email, baseURL!);
    for (const path of ["/admin", "/admin/users", `/admin/users/${admin.id}`]) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});
