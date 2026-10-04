import { describe, expect, it } from "vitest";

import { parseUserListQuery, userListHref, userSearchFilter } from "./user-query";

describe("회원 목록 조건", () => {
  it("모르는 값은 전체, 페이지는 1 이상", () => {
    expect(
      parseUserListQuery({ role: "hacker", status: "active", page: "-3", under14: ["yes", "no"] }),
    ).toEqual({
      q: "",
      role: "all",
      status: "active",
      teacher: "all",
      under14: "yes",
      page: 1,
    });
    expect(parseUserListQuery({ q: "  김  ", page: "3", teacher: "pending" })).toMatchObject({
      q: "김",
      page: 3,
      teacher: "pending",
    });
    expect(parseUserListQuery({ q: "가".repeat(101) }).q).toBe("");
  });

  it("주소에는 기본값을 빼고 넣는다", () => {
    expect(userListHref({})).toBe("/admin/users");
    expect(userListHref({ q: "kim", role: "teacher", status: "all", page: 2 })).toBe(
      "/admin/users?q=kim&role=teacher&page=2",
    );
  });

  it("검색어: 조건 문법 문자는 지우고 LIKE 특수 문자는 그대로 찾는다", () => {
    expect(userSearchFilter("kim")).toBe('email.ilike."%kim%",nickname.ilike."%kim%"');
    expect(userSearchFilter("a,b)or(c")).toBe(
      'email.ilike."%a b or c%",nickname.ilike."%a b or c%"',
    );
    expect(userSearchFilter("50%_off")).toBe(
      'email.ilike."%50\\%\\_off%",nickname.ilike."%50\\%\\_off%"',
    );
    expect(userSearchFilter(' ",() ')).toBeNull();
  });
});
