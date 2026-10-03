import { expect, test } from "@playwright/test";

import { createMenuViaAdmin, deleteMenuViaAdmin, withAdminPage } from "./helpers/menus";
import { adminClient, hasSupabase, randomSuffix } from "./helpers/supabase";

test.describe("홈(F-11)", () => {
  test.skip(!hasSupabase, "Supabase 환경변수가 필요합니다");

  test("메뉴 바로가기와 AI Bridge 모델을 보여 준다", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 2, name: "AI Bridge 교육 모델" }),
    ).toBeVisible();
    const cards = page.getByRole("region", { name: "메뉴 바로가기" });
    await expect(cards.getByRole("link", { name: /AI 리터러시/ })).toHaveAttribute(
      "href",
      "/ai-literacy",
    );
    // 그룹 카드는 첫 하위 메뉴로 가고 하위 메뉴 이름을 보여 준다
    const group = cards.getByRole("link", { name: /AI 코딩/ });
    await expect(group).toHaveAttribute("href", "/ai-coding/python-basics");
    await expect(group).toContainText("파이썬 기초 코딩");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("관리자가 공개한 자료가 최근 공개 자료에 바로 나온다", async ({
    page,
    browser,
    baseURL,
    isMobile,
  }) => {
    test.skip(isMobile, "데스크톱에서만(공개 목록을 함께 쓰므로)");
    const tag = randomSuffix();
    const slug = `e2e-${tag}`;
    const title = `홈${tag}`;
    const menuId = await createMenuViaAdmin(browser, baseURL!, { slug, title });
    try {
      await withAdminPage(browser, baseURL!, async (admin) => {
        await admin.goto(`/admin/posts/new?menu=${menuId}`);
        await admin.getByLabel("제목").fill(`최신 차시 ${tag}`);
        await admin.getByRole("button", { name: "초안 만들고 에디터 열기" }).click();
        await admin.locator(".bn-editor").click();
        await admin.keyboard.type("본문");
        await admin.getByRole("button", { name: "공개하기" }).click();
        await expect(admin.getByText("공개 중", { exact: true })).toBeVisible();
      });

      await page.goto("/");
      const recent = page.getByRole("list", { name: "최근 공개 자료" });
      await expect(
        recent.getByRole("link", { name: new RegExp(`최신 차시 ${tag}`) }),
      ).toBeVisible();
    } finally {
      await deleteMenuViaAdmin(browser, baseURL!, { id: menuId, title });
    }
  });
});

test.describe("사이트 설정(/admin/settings)", () => {
  test.skip(!hasSupabase, "Supabase 환경변수가 필요합니다");

  test("홈 문구·온라인 저지 주소를 저장하고 비우면 기본값으로", async ({
    page,
    browser,
    baseURL,
    isMobile,
  }) => {
    test.skip(isMobile, "공용 설정을 바꾸므로 데스크톱에서만");
    const { data: existing } = await adminClient().from("site_settings").select("key");
    test.skip((existing ?? []).length > 0, "이미 운영 설정이 있으면 건드리지 않는다");

    const hero = `테스트 문구 ${randomSuffix()}`;
    try {
      await withAdminPage(browser, baseURL!, async (admin) => {
        await admin.goto("/admin/settings");
        await admin.getByLabel("문제 주소 형식").fill("https://judge.example.com/problem/");
        await admin.getByRole("button", { name: "저장" }).click();
        await expect(admin.getByText("문제 번호 자리 {id}", { exact: false })).toBeVisible();

        await admin.getByLabel("홈 문구").fill(hero);
        await admin.getByLabel("문제 주소 형식").fill("https://judge.example.com/problem/{id}");
        await admin.getByRole("button", { name: "저장" }).click();
        await expect(
          admin.getByRole("status").filter({ hasText: "설정을 저장했습니다" }),
        ).toBeVisible();
      });
      await page.goto("/");
      await expect(page.getByRole("main").getByText(hero)).toBeVisible();

      await withAdminPage(browser, baseURL!, async (admin) => {
        await admin.goto("/admin/settings");
        await admin.getByLabel("홈 문구").fill("");
        await admin.getByLabel("문제 주소 형식").fill("");
        await admin.getByRole("button", { name: "저장" }).click();
        await expect(
          admin.getByRole("status").filter({ hasText: "설정을 저장했습니다" }),
        ).toBeVisible();
      });
      await page.goto("/");
      await expect(
        page.getByRole("main").getByText("이해에서 창작까지, AI 교육을 켜다"),
      ).toBeVisible();
      const { data: after } = await adminClient().from("site_settings").select("key");
      expect(after).toEqual([]);
    } finally {
      await adminClient()
        .from("site_settings")
        .delete()
        .in("key", ["home_hero_text", "online_judge_problem_url"]);
    }
  });
});
