import { expect, test } from "@playwright/test";

import {
  adminClient,
  createMember,
  deleteTestUser,
  hasSupabase,
  loginAs,
  randomSuffix,
} from "./helpers/supabase";
import { createMenuViaAdmin, deleteMenuViaAdmin } from "./helpers/menus";

const t = (s: string) => [{ type: "text", text: s, styles: {} }];
const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const IMAGE_URL = "https://example.com/e2e-board-thumb.png";

/** 게시판 피드(F-08): 고정글 + 인기 글(2.9천) + 최신 글 + 채우기 22개 = 일반 글 24개 */
test.describe("게시판 피드(F-08)", () => {
  test.skip(!hasSupabase, "Supabase 환경변수가 필요합니다");
  // 준비(관리자 화면 로그인)가 무거워 워커마다 반복되지 않게 한 워커에서 차례로 돈다.
  test.describe.configure({ mode: "default" });

  const slug = `e2e-${randomSuffix()}`;
  const title = `게시판${slug.slice(-4)}`;
  let menuId: string;
  let author: { id: string; email: string };
  let nickname: string;
  const users: string[] = [];

  test.beforeAll(async ({ browser, baseURL }) => {
    const db = adminClient();
    menuId = await createMenuViaAdmin(browser, baseURL!, { slug, title, type: "board" });
    // 글쓰기 등급은 화면 캐시가 아니라 DB(can_write_board)로 검사하므로 바로 반영된다.
    await db.from("menus").update({ board_write_role: "student" }).eq("id", menuId);

    nickname = `글쓴${randomSuffix()}`.slice(0, 12);
    author = await createMember({ nickname });
    users.push(author.id);

    const base = {
      menu_id: menuId,
      status: "published",
      author_id: author.id,
      score: 0,
      is_pinned: false,
    };
    const fillers = Array.from({ length: 22 }, (_, i) => ({
      ...base,
      title: `채우기 ${i + 1}`,
      slug: `fill-${i + 1}`,
      content: [],
      content_text: "",
      created_at: ago((72 + i) * HOUR),
    }));
    const { error } = await db.from("posts").insert([
      {
        ...base,
        title: "고정 공지",
        slug: "pinned",
        is_pinned: true,
        content: [],
        content_text: "",
        created_at: ago(10 * 24 * HOUR),
      },
      {
        ...base,
        title: "인기 글",
        slug: "popular",
        score: 2900,
        content: [
          {
            id: "p",
            type: "paragraph",
            props: {},
            content: t("미리보기 문장입니다"),
            children: [],
          },
          { id: "i", type: "image", props: { url: IMAGE_URL }, children: [] },
        ],
        content_text: "미리보기 문장입니다",
        created_at: ago(48 * HOUR),
      },
      {
        ...base,
        title: "최신 글",
        slug: "latest",
        score: 1,
        content: [],
        content_text: "",
        created_at: ago(60 * 1000),
      },
      ...fillers,
    ]);
    if (error) throw new Error(error.message);
  });

  test.afterAll(async ({ browser, baseURL }) => {
    if (menuId) {
      await adminClient()
        .from("votes")
        .delete()
        .eq("target_type", "post")
        .in(
          "target_id",
          ((await adminClient().from("posts").select("id").eq("menu_id", menuId)).data ?? []).map(
            (p) => p.id,
          ),
        );
      await deleteMenuViaAdmin(browser, baseURL!, { id: menuId, title });
    }
    for (const id of users) await deleteTestUser(id);
  });

  const feed = (page: import("@playwright/test").Page) =>
    page.getByRole("list", { name: `${title} 글 목록` });

  test("비회원: 카드 내용·고정글·무한 스크롤", async ({ page }) => {
    await page.goto(`/${slug}`);
    const list = feed(page);
    const cards = list.getByRole("article");

    // 고정글은 맨 위에 "공지" 배지와 함께
    await expect(cards.first()).toContainText("공지");
    await expect(cards.first().getByRole("heading")).toHaveText("고정 공지");

    // 카드: 메뉴명·닉네임·상대 시간·미리보기·썸네일·축약 점수
    const popular = list.getByRole("article", { name: "인기 글" });
    await expect(popular).toContainText(title);
    await expect(popular).toContainText(nickname);
    await expect(popular.locator("time")).toHaveText("2일 전");
    await expect(popular).toContainText("미리보기 문장입니다");
    await expect(popular.locator("img")).toHaveAttribute("src", IMAGE_URL);
    await expect(popular.getByTestId("score")).toHaveText("점수 2.9천");
    await expect(popular.getByRole("link", { name: "댓글 0개" })).toBeVisible();
    await expect(list.getByRole("article", { name: "최신 글" }).locator("time")).toHaveText(
      /방금 전|1분 전/,
    );

    // 비회원에게는 글쓰기 버튼이 없다
    await expect(page.getByRole("link", { name: "글쓰기" })).toHaveCount(0);

    // 첫 페이지 20개 + 고정 1개 → 스크롤하면 나머지 4개
    await expect(cards).toHaveCount(21);
    await page.getByRole("button", { name: "더 보기" }).scrollIntoViewIfNeeded();
    await expect(cards).toHaveCount(25);
    await expect(page.getByRole("button", { name: "더 보기" })).toHaveCount(0);
    const titles = await cards.getByRole("heading").allTextContents();
    expect(new Set(titles).size).toBe(25);
  });

  test("정렬 탭: 최신·추천순(기간)", async ({ page }) => {
    await page.goto(`/${slug}`);
    const nav = page.getByRole("navigation", { name: "정렬" });
    await expect(nav.getByRole("link", { name: "인기" })).toHaveAttribute("aria-current", "page");

    await nav.getByRole("link", { name: "최신" }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}\\?sort=new$`));
    const headings = feed(page).getByRole("article").getByRole("heading");
    await expect(headings.nth(0)).toHaveText("고정 공지");
    await expect(headings.nth(1)).toHaveText("최신 글");
    await expect(headings.nth(2)).toHaveText("인기 글");

    await nav.getByRole("link", { name: "추천순" }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}\\?sort=top$`));
    const period = page.getByRole("navigation", { name: "기간" });
    await expect(period.getByRole("link", { name: "이번 주" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(headings.nth(1)).toHaveText("인기 글");

    // 오늘: 2일 전 글은 빠지고 고정글은 그대로
    await period.getByRole("link", { name: "오늘" }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}\\?sort=top&t=day$`));
    await expect(headings).toHaveText(["고정 공지", "최신 글"]);
  });

  test("비회원이 투표하면 로그인 안내, 공유는 링크 복사", async ({ page, context, baseURL }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
    await page.goto(`/${slug}`);
    const card = feed(page).getByRole("article", { name: "최신 글" });

    await card.getByRole("button", { name: "추천", exact: true }).click();
    const status = page.getByRole("status");
    await expect(status).toContainText("투표하려면 로그인해 주세요.");
    await expect(status.getByRole("link", { name: "로그인" })).toHaveAttribute(
      "href",
      `/login?next=${encodeURIComponent(`/${slug}`)}`,
    );
    await expect(card.getByTestId("score")).toHaveText("점수 1");

    await card.getByRole("button", { name: "공유" }).click();
    await expect(status).toHaveText("링크를 복사했습니다.");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(new RegExp(`^https?://[^/]+/${slug}/latest$`));
  });

  test("회원: 추천 → 취소 → 비추천 → 취소, 새로고침해도 유지", async ({ browser, baseURL }) => {
    const member = await createMember();
    users.push(member.id);
    const context = await browser.newContext({ baseURL });
    try {
      await loginAs(context, member.email, baseURL!);
      const page = await context.newPage();
      await page.goto(`/${slug}`);
      await expect(page.getByRole("link", { name: "글쓰기" })).toHaveAttribute(
        "href",
        `/${slug}/submit`,
      );

      const card = () => feed(page).getByRole("article", { name: "최신 글" });
      const up = () => card().getByRole("button", { name: "추천", exact: true });
      const down = () => card().getByRole("button", { name: "비추천" });
      const score = () => card().getByTestId("score");

      await up().click();
      await expect(up()).toHaveAttribute("aria-pressed", "true");
      await expect(score()).toHaveText("점수 2");
      await expect(up()).toBeEnabled(); // 서버 응답까지 기다림

      await page.reload();
      await expect(up()).toHaveAttribute("aria-pressed", "true");
      await expect(score()).toHaveText("점수 2");

      await up().click(); // 같은 버튼 → 취소
      await expect(up()).toHaveAttribute("aria-pressed", "false");
      await expect(score()).toHaveText("점수 1");
      await expect(up()).toBeEnabled();

      await down().click(); // 비추천
      await expect(down()).toHaveAttribute("aria-pressed", "true");
      await expect(score()).toHaveText("점수 0");
      await expect(down()).toBeEnabled();

      await down().click(); // 취소
      await expect(score()).toHaveText("점수 1");
      await expect(down()).toBeEnabled();

      const { data } = await adminClient().from("votes").select("value").eq("user_id", member.id);
      expect(data).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("390px에서 가로 스크롤이 생기지 않는다", async ({ page, isMobile }) => {
    test.skip(!isMobile, "모바일 전용");
    await page.goto(`/${slug}`);
    await expect(feed(page).getByRole("article").first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
