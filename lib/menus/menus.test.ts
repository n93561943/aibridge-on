import { describe, expect, it } from "vitest";

import { menuInputSchema, RESERVED_SLUGS } from "./schema";
import type { MenuRow } from "./schema";
import {
  buildMenuTree,
  findMenuByPath,
  menuHref,
  moveSibling,
  siblingsOf,
  toNavItems,
} from "./tree";

let seq = 0;
function row(overrides: Partial<MenuRow> & Pick<MenuRow, "slug" | "type">): MenuRow {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    parent_id: null,
    title: overrides.slug,
    external_url: null,
    board_write_role: overrides.type === "board" ? "admin" : null,
    board_allow_comments: true,
    board_allow_votes: true,
    sort_order: seq,
    is_active: true,
    created_at: "2026-10-03T00:00:00Z",
    updated_at: "2026-10-03T00:00:00Z",
    ...overrides,
  };
}

/** SPEC 4장 시드와 같은 구조 */
function seedRows() {
  const literacy = row({ slug: "ai-literacy", type: "series", sort_order: 1 });
  const coding = row({ slug: "ai-coding", type: "group", sort_order: 2 });
  const python = row({
    slug: "python-basics",
    type: "series",
    parent_id: coding.id,
    sort_order: 1,
  });
  const judge = row({
    slug: "online-judge",
    type: "link",
    parent_id: coding.id,
    is_active: false,
    sort_order: 2,
  });
  const aiProg = row({
    slug: "ai-programming",
    type: "series",
    parent_id: coding.id,
    sort_order: 3,
  });
  const vibe = row({ slug: "vibe-coding", type: "series", sort_order: 3 });
  const notice = row({ slug: "notice", type: "board", sort_order: 4 });
  return { literacy, coding, python, judge, aiProg, vibe, notice };
}

describe("menuInputSchema", () => {
  const base = { type: "series", title: "AI 리터러시", slug: "ai-literacy", isActive: "on" };

  it("정상 입력을 menus 행 값으로 바꾼다", () => {
    expect(menuInputSchema.parse(base)).toEqual({
      type: "series",
      title: "AI 리터러시",
      slug: "ai-literacy",
      parent_id: null,
      external_url: null,
      board_write_role: null,
      board_allow_comments: true,
      board_allow_votes: true,
      is_active: true,
    });
  });

  it.each(["AI-literacy", "ai_literacy", "ai literacy", "-ai", "ai-", "ai--x", "한글"])(
    "slug 형식이 틀리면 거부한다: %s",
    (slug) => {
      const result = menuInputSchema.safeParse({ ...base, slug });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toEqual(["slug"]);
    },
  );

  it.each(RESERVED_SLUGS)("기존 라우트와 겹치는 slug는 거부한다: %s", (slug) => {
    expect(menuInputSchema.safeParse({ ...base, slug }).success).toBe(false);
  });

  it("제목은 공백만으로 둘 수 없고 30자를 넘을 수 없다", () => {
    expect(menuInputSchema.safeParse({ ...base, title: "   " }).success).toBe(false);
    expect(menuInputSchema.safeParse({ ...base, title: "가".repeat(31) }).success).toBe(false);
  });

  it("그룹은 상위 메뉴를 가질 수 없다", () => {
    const result = menuInputSchema.safeParse({
      ...base,
      type: "group",
      parentId: "00000000-0000-4000-8000-000000000001",
    });
    expect(result.error?.issues[0].path).toEqual(["parentId"]);
  });

  it("link를 활성화하려면 http(s) 주소가 필요하다", () => {
    const link = { ...base, type: "link", slug: "judge" };
    expect(menuInputSchema.safeParse(link).error?.issues[0].path).toEqual(["externalUrl"]);
    expect(menuInputSchema.safeParse({ ...link, externalUrl: "javascript:alert(1)" }).success).toBe(
      false,
    );
    // 주소가 없어도 비활성이면 저장할 수 있다(온라인 저지 주소 미정)
    expect(menuInputSchema.parse({ ...link, isActive: undefined }).external_url).toBeNull();
    expect(
      menuInputSchema.parse({ ...link, externalUrl: "https://judge.example.com" }).external_url,
    ).toBe("https://judge.example.com");
  });

  it("board는 글쓰기 등급이 필요하고, 체크하지 않은 설정은 false가 된다", () => {
    const board = { ...base, type: "board", slug: "notice" };
    expect(menuInputSchema.safeParse(board).error?.issues[0].path).toEqual(["boardWriteRole"]);
    expect(menuInputSchema.safeParse({ ...board, boardWriteRole: "owner" }).success).toBe(false);
    const parsed = menuInputSchema.parse({
      ...board,
      boardWriteRole: "student",
      boardAllowComments: "on",
    });
    expect(parsed).toMatchObject({
      board_write_role: "student",
      board_allow_comments: true,
      board_allow_votes: false,
    });
  });

  it("유형에 맞지 않는 설정값은 버린다", () => {
    const parsed = menuInputSchema.parse({
      ...base,
      externalUrl: "https://x.example.com",
      boardWriteRole: "admin",
    });
    expect(parsed.external_url).toBeNull();
    expect(parsed.board_write_role).toBeNull();
  });
});

describe("buildMenuTree", () => {
  it("순서대로 2단계 트리를 만든다", () => {
    const r = seedRows();
    const tree = buildMenuTree(Object.values(r).reverse());
    expect(tree.map((n) => n.slug)).toEqual(["ai-literacy", "ai-coding", "vibe-coding", "notice"]);
    expect(tree[1].children.map((n) => n.slug)).toEqual([
      "python-basics",
      "online-judge",
      "ai-programming",
    ]);
  });

  it("상위 메뉴가 없으면(비활성으로 조회되지 않음) 하위 메뉴도 버린다", () => {
    const r = seedRows();
    const tree = buildMenuTree([r.literacy, r.python, r.aiProg]);
    expect(tree.map((n) => n.slug)).toEqual(["ai-literacy"]);
  });
});

describe("menuHref·toNavItems", () => {
  it("SPEC 시드 메뉴를 헤더 항목으로 바꾼다(비활성 링크는 숨김)", () => {
    expect(toNavItems(buildMenuTree(Object.values(seedRows())))).toEqual([
      { title: "ai-literacy", href: "/ai-literacy" },
      {
        title: "ai-coding",
        href: "/ai-coding/python-basics",
        children: [
          { title: "python-basics", href: "/ai-coding/python-basics" },
          { title: "ai-programming", href: "/ai-coding/ai-programming" },
        ],
      },
      { title: "vibe-coding", href: "/vibe-coding" },
      { title: "notice", href: "/notice" },
    ]);
  });

  it("link는 외부 주소를 새 탭으로 연다", () => {
    const r = seedRows();
    const judge = { ...r.judge, is_active: true, external_url: "https://judge.example.com" };
    const items = toNavItems(buildMenuTree([r.coding, judge, r.python]));
    expect(items[0].href).toBe("/ai-coding/python-basics");
    expect(items[0].children?.[1]).toEqual({
      title: "online-judge",
      href: "https://judge.example.com",
      external: true,
    });
  });

  it("보이는 하위 메뉴가 없는 그룹·비활성 메뉴는 헤더에서 뺀다", () => {
    const r = seedRows();
    const tree = buildMenuTree([r.coding, r.judge, { ...r.literacy, is_active: false }]);
    expect(toNavItems(tree)).toEqual([]);
    expect(menuHref(tree[0])).toBeNull();
  });
});

describe("findMenuByPath", () => {
  const tree = buildMenuTree(Object.values(seedRows()));

  it("대메뉴와 하위 메뉴를 찾는다", () => {
    expect(findMenuByPath(tree, ["ai-literacy"])?.menu.slug).toBe("ai-literacy");
    const found = findMenuByPath(tree, ["ai-coding", "python-basics"]);
    expect(found?.menu.slug).toBe("python-basics");
    expect(found?.parent?.slug).toBe("ai-coding");
  });

  it("다른 상위 메뉴 아래 주소나 비활성·없는 메뉴는 찾지 않는다", () => {
    expect(findMenuByPath(tree, ["python-basics"])).toBeNull();
    expect(findMenuByPath(tree, ["ai-literacy", "python-basics"])).toBeNull();
    expect(findMenuByPath(tree, ["ai-coding", "online-judge"])).toBeNull();
    expect(findMenuByPath(tree, ["nope"])).toBeNull();
    expect(findMenuByPath(tree, ["ai-coding", "python-basics", "x"])).toBeNull();
  });
});

describe("moveSibling", () => {
  const tree = buildMenuTree(Object.values(seedRows()));

  it("대메뉴 순서를 바꾼다", () => {
    const next = moveSibling(tree, null, 3, 0);
    expect(next.map((n) => n.slug)).toEqual(["notice", "ai-literacy", "ai-coding", "vibe-coding"]);
    expect(tree[0].slug).toBe("ai-literacy"); // 원본은 그대로
  });

  it("하위 메뉴 순서를 바꾼다", () => {
    const coding = tree[1];
    const next = moveSibling(tree, coding.id, 0, 2);
    expect(siblingsOf(next, coding.id).map((n) => n.slug)).toEqual([
      "online-judge",
      "ai-programming",
      "python-basics",
    ]);
  });

  it("범위를 벗어나면 그대로 둔다", () => {
    expect(moveSibling(tree, null, 0, -1)).toBe(tree);
    expect(moveSibling(tree, null, 0, 4)).toBe(tree);
  });
});
