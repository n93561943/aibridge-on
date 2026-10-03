import { expect, test } from "@playwright/test";
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

// 테스트가 만드는 메뉴 slug는 "e2e-<랜덤>"으로 시작한다. 데스크톱·모바일 프로젝트가 동시에 돌므로
// 각 테스트는 자기 접두사의 메뉴만 지운다. 중간에 끊기면 대시보드에서 slug가 e2e-로 시작하는 메뉴를 지운다.
function newPrefix() {
  return `e2e-${randomSuffix()}`;
}

async function cleanupMenus(prefix: string) {
  const db = adminClient();
  // 하위 메뉴부터 지운다(상위 메뉴는 on delete restrict)
  await db.from("menus").delete().like("slug", `${prefix}%`).not("parent_id", "is", null);
  await db.from("menus").delete().like("slug", `${prefix}%`);
}

test.describe("RLS: menus", () => {
  test.skip(({ isMobile }) => isMobile || !hasSupabase, "데스크톱 + Supabase 환경에서만");

  let student: { id: string; email: string };
  let admin: { id: string; email: string };
  const prefix = newPrefix();
  const hiddenSlug = `${prefix}-hidden`;

  test.beforeAll(async () => {
    student = await createMember();
    admin = await createMember({ role: "admin" });
    const { error } = await adminClient()
      .from("menus")
      .insert({ slug: hiddenSlug, title: "숨김", type: "series", is_active: false });
    if (error) throw new Error(error.message);
  });

  test.afterAll(async () => {
    await cleanupMenus(prefix);
    if (student) await deleteTestUser(student.id);
    if (admin) await deleteTestUser(admin.id);
  });

  test("비회원은 활성 메뉴만 읽고 쓸 수 없다", async () => {
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { data } = await anon.from("menus").select("slug, is_active");
    expect(data?.length).toBeGreaterThan(0);
    expect(data?.every((m) => m.is_active)).toBe(true);
    expect(data?.some((m) => m.slug === hiddenSlug)).toBe(false);

    const { error } = await anon
      .from("menus")
      .insert({ slug: `${prefix}-anon`, title: "x", type: "series" });
    expect(error).not.toBeNull();
  });

  test("학생은 비활성 메뉴를 못 읽고, 추가·수정·삭제·순서 변경을 못 한다", async () => {
    const client = await userClient(student.email);
    const { data } = await client.from("menus").select("slug").eq("slug", hiddenSlug);
    expect(data).toHaveLength(0);

    const insert = await client
      .from("menus")
      .insert({ slug: `${prefix}-stu`, title: "x", type: "series" });
    expect(insert.error).not.toBeNull();

    const update = await client
      .from("menus")
      .update({ title: "바뀜" })
      .eq("slug", "notice")
      .select("id");
    expect(update.data ?? []).toHaveLength(0);

    const del = await client.from("menus").delete().eq("slug", "notice").select("id");
    expect(del.data ?? []).toHaveLength(0);

    const { data: roots } = await client.from("menus").select("id").is("parent_id", null);
    const reorder = await client.rpc("reorder_menus", { p_ids: (roots ?? []).map((r) => r.id) });
    expect(reorder.error).not.toBeNull();
  });

  test("관리자는 비활성 메뉴까지 읽는다", async () => {
    const client = await userClient(admin.email);
    const { data } = await client.from("menus").select("slug").eq("slug", hiddenSlug);
    expect(data).toHaveLength(1);
  });
});

test.describe("메뉴 화면", () => {
  test.skip(!hasSupabase, "Supabase 환경변수가 필요합니다");

  test("헤더에 시드 메뉴가 보이고, 그룹은 첫 하위 메뉴로 이동한다", async ({ page, isMobile }) => {
    await page.goto("/");
    if (isMobile) {
      await page.getByRole("button", { name: "메뉴 열기" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("link", { name: "AI 리터러시" })).toBeVisible();
      await expect(dialog.getByRole("link", { name: "파이썬 기초 코딩" })).toBeVisible();
      await expect(dialog.getByRole("link", { name: "온라인 저지" })).toHaveCount(0);
    } else {
      const nav = page.getByRole("navigation", { name: "주 메뉴" });
      await expect(nav.getByRole("link", { name: "AI 리터러시" })).toBeVisible();
      await nav.getByRole("button", { name: "AI 코딩" }).click();
      await expect(page.getByRole("menuitem", { name: "파이썬 기초 코딩" })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: "온라인 저지" })).toHaveCount(0);
    }

    await page.goto("/ai-coding");
    await expect(page).toHaveURL(/\/ai-coding\/python-basics$/);
    await expect(page.getByRole("heading", { level: 1, name: "파이썬 기초 코딩" })).toBeVisible();
  });

  test("없는 메뉴·비활성 메뉴·잘못된 상위 경로는 404", async ({ page }) => {
    for (const path of ["/no-such-menu", "/ai-coding/online-judge", "/ai-literacy/python-basics"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
    }
  });

  test("비관리자는 /admin/menus에 들어갈 수 없다", async ({ page }) => {
    await page.goto("/admin/menus");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);
  });
});

test.describe("관리자 메뉴 관리", () => {
  test.skip(!hasSupabase, "Supabase 환경변수가 필요합니다");
  let admin: { id: string; email: string };
  let prefix: string;

  test.beforeEach(async ({ context, baseURL }) => {
    prefix = newPrefix();
    admin = await createMember({ role: "admin" });
    await loginAs(context, admin.email, baseURL!);
  });

  test.afterEach(async () => {
    await cleanupMenus(prefix);
    if (admin) await deleteTestUser(admin.id);
  });

  test("메뉴 추가 → 헤더 반영 → 숨기기 → 삭제", async ({ page, isMobile }) => {
    const slug = prefix;
    const title = `테스트${slug.slice(-4)}`;

    await page.goto("/admin/menus");
    await expect(page.getByRole("heading", { name: "메뉴 관리" })).toBeVisible();

    // 입력 오류는 값을 유지한 채 보여 준다
    await page.getByRole("button", { name: "메뉴 추가", exact: true }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("제목").fill(title);
    await sheet.getByLabel("주소(slug)").fill("Admin");
    await sheet.getByRole("button", { name: "메뉴 추가" }).click();
    await expect(sheet.getByText("영문 소문자·숫자와 하이픈", { exact: false })).toBeVisible();
    await expect(sheet.getByLabel("제목")).toHaveValue(title);

    await sheet.getByLabel("주소(slug)").fill(slug);
    await sheet.getByRole("button", { name: "메뉴 추가" }).click();
    await expect(page.getByRole("status").filter({ hasText: "메뉴를 만들었습니다" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // 페이지 가로 스크롤 없음(390px 포함)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // 헤더에 바로 반영된다(캐시 재검증)
    await page.goto("/");
    const headerLink = isMobile
      ? (await page.getByRole("button", { name: "메뉴 열기" }).click(),
        page.getByRole("dialog").getByRole("link", { name: title }))
      : page.getByRole("navigation", { name: "주 메뉴" }).getByRole("link", { name: title });
    await expect(headerLink).toHaveAttribute("href", `/${slug}`);
    await page.goto(`/${slug}`);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();

    // 숨기면 헤더에서 빠지고 주소는 404
    await page.goto("/admin/menus");
    await page.getByRole("button", { name: `사이트에 보이기: ${title}` }).click();
    await expect(page.getByRole("status").filter({ hasText: "비활성화했습니다" })).toBeVisible();
    const res = await page.goto(`/${slug}`);
    expect(res?.status()).toBe(404);

    // 삭제는 한 번 더 확인한다
    await page.goto("/admin/menus");
    await page.getByRole("button", { name: `삭제: ${title}` }).click();
    await page.getByRole("button", { name: "삭제", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "삭제했습니다" })).toBeVisible();
    await expect(page.getByRole("list", { name: "대메뉴" }).getByText(title)).toHaveCount(0);
  });

  test("위아래 버튼으로 순서를 바꾸면 DB에 저장된다", async ({ page }) => {
    const db = adminClient();
    const group = prefix;
    const tag = group.slice(-4);
    const { data: g, error } = await db
      .from("menus")
      .insert({ slug: group, title: `그룹${tag}`, type: "group", is_active: false })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await db.from("menus").insert([
      { slug: `${group}-a`, title: `첫째${tag}`, type: "series", parent_id: g.id, sort_order: 1 },
      { slug: `${group}-b`, title: `둘째${tag}`, type: "series", parent_id: g.id, sort_order: 2 },
    ]);

    await page.goto("/admin/menus");
    await page.getByRole("button", { name: `아래로: 첫째${tag}` }).click();
    await expect(page.getByRole("status").filter({ hasText: "순서를 바꿨습니다" })).toBeVisible();

    const { data } = await db
      .from("menus")
      .select("title")
      .eq("parent_id", g.id)
      .order("sort_order");
    expect(data?.map((m) => m.title)).toEqual([`둘째${tag}`, `첫째${tag}`]);

    // 하위 메뉴가 있는 그룹은 삭제할 수 없다
    await page.getByRole("button", { name: `삭제: 그룹${tag}` }).click();
    await page.getByRole("button", { name: "삭제", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "하위 메뉴가 있습니다" }),
    ).toBeVisible();
  });
});
