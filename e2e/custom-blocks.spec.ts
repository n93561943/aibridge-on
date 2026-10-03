import { expect, type Page, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  adminClient,
  createMember,
  deleteTestUser,
  hasSupabase,
  loginAs,
  randomSuffix,
  userClient,
} from "./helpers/supabase";

const SETTING = "online_judge_problem_url";

async function waitSaved(page: Page) {
  await expect(page.getByRole("status").filter({ hasText: /^저장됨/ })).toBeVisible({
    timeout: 15_000,
  });
}

test.describe("커스텀 블록(교사 전용 박스·온라인 저지)", () => {
  test.skip(!hasSupabase, "Supabase 환경변수가 필요합니다");

  let admin: { id: string; email: string };
  let menuId: string;
  let postId: string;
  let hadSetting: unknown;

  test.beforeEach(async ({ context, baseURL }) => {
    admin = await createMember({ role: "admin" });
    await loginAs(context, admin.email, baseURL!);
    const db = adminClient();
    const { data: menu } = await db
      .from("menus")
      .insert({
        slug: `e2e-${randomSuffix()}`,
        title: "블록 테스트",
        type: "series",
        is_active: false,
      })
      .select("id")
      .single();
    menuId = menu!.id;
    const { data: post } = await db
      .from("posts")
      .insert({ menu_id: menuId, title: "블록 테스트", slug: "p1", content: [], content_text: "" })
      .select("id")
      .single();
    postId = post!.id;
    hadSetting = (await db.from("site_settings").select("value").eq("key", SETTING).maybeSingle())
      .data;
  });

  test.afterEach(async () => {
    const db = adminClient();
    if (menuId) {
      await db.from("posts").delete().eq("menu_id", menuId);
      await db.from("menus").delete().eq("id", menuId);
    }
    if (admin) await deleteTestUser(admin.id);
  });

  async function insertBlock(page: Page, query: string) {
    await page.locator(".bn-editor").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(`/${query}`);
    await page.locator(".bn-suggestion-menu-item").first().click();
  }

  test("교사 전용 박스 내용은 검색용 평문에서 빠진다", async ({ page }) => {
    await page.goto(`/admin/posts/${postId}`);
    await page.locator(".bn-editor").click();
    await page.keyboard.type("학생에게 보이는 문장");
    await page.keyboard.press("Enter");
    await insertBlock(page, "교사 전용");
    await page.keyboard.type("정답 안내");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await page.keyboard.type("정답은 42입니다");
    await waitSaved(page);

    const { data } = await adminClient()
      .from("posts")
      .select("content, content_text")
      .eq("id", postId)
      .single();
    expect(JSON.stringify(data!.content)).toContain("teacherBox");
    expect(JSON.stringify(data!.content)).toContain("정답은 42입니다");
    expect(data!.content_text).toContain("학생에게 보이는 문장");
    expect(data!.content_text).not.toContain("정답 안내");
    expect(data!.content_text).not.toContain("42");
  });

  test("온라인 저지 문제 링크: 주소 미설정이면 준비 중, 설정하면 활성화", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "공용 설정을 바꾸므로 데스크톱에서만");
    test.skip(hadSetting !== null, "이미 운영 주소가 설정되어 있으면 건드리지 않는다");

    await page.goto(`/admin/posts/${postId}`);
    await insertBlock(page, "온라인 저지");
    const problem = page.getByLabel("문제 번호");
    await problem.fill("1001");
    await problem.blur();
    await expect(page.getByText("1001번 문제 풀기 (준비 중)")).toBeVisible();
    await waitSaved(page);

    const db = adminClient();
    const { error } = await db
      .from("site_settings")
      .insert({ key: SETTING, value: "https://judge.example.com/problem/{id}" });
    expect(error).toBeNull();
    try {
      await page.reload();
      await expect(page.getByRole("link", { name: /1001번 문제 풀기/ })).toHaveAttribute(
        "href",
        "https://judge.example.com/problem/1001",
      );
    } finally {
      await db.from("site_settings").delete().eq("key", SETTING);
    }
  });

  test("site_settings: 공개 키만 누구나 읽고, 쓰기는 관리자만", async ({ isMobile }) => {
    test.skip(isMobile, "DB 권한 검사는 데스크톱에서만");
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const insert = await anon.from("site_settings").insert({ key: "ai_enabled", value: true });
    expect(insert.error).not.toBeNull();

    const student = await createMember();
    try {
      const client = await userClient(student.email);
      const write = await client
        .from("site_settings")
        .insert({ key: "home_hero_text", value: "해킹" });
      expect(write.error).not.toBeNull();
    } finally {
      await deleteTestUser(student.id);
    }

    // 형식이 틀린 온라인 저지 주소는 DB가 거부한다({id} 없음, javascript:)
    const db = adminClient();
    for (const value of ["https://judge.example.com/problem/", "javascript:alert('{id}')"]) {
      const { error } = await db.from("site_settings").insert({ key: `${SETTING}`, value });
      expect(error, value).not.toBeNull();
    }
  });
});
