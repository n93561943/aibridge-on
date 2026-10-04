import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { SiteHeader } from "./site-header";

describe("SiteHeader", () => {
  it("로고와 햄버거 버튼을 렌더링한다", () => {
    render(<SiteHeader items={[]} />);
    expect(screen.getByRole("link", { name: "AI Bridge:ON 홈" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: "메뉴 열기" })).toBeInTheDocument();
  });

  it("전달된 메뉴를 표시하고 외부 링크는 새 탭으로 연다", () => {
    render(
      <SiteHeader
        items={[
          { title: "AI 리터러시", href: "/ai-literacy" },
          { title: "온라인 저지", href: "https://judge.example.com", external: true },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "AI 리터러시" })).toHaveAttribute(
      "href",
      "/ai-literacy",
    );
    expect(screen.getByRole("link", { name: "온라인 저지" })).toHaveAttribute("target", "_blank");
  });

  it("햄버거 버튼을 누르면 모바일 메뉴가 열린다", async () => {
    render(<SiteHeader items={[]} />);
    await userEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("준비 중인 메뉴입니다.")).toBeInTheDocument();
  });

  it("비로그인이면 로그인 링크를 보여 준다", () => {
    render(<SiteHeader items={[]} />);
    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login");
  });

  it("로그인하면 닉네임 메뉴를 보여 주고 로그인 링크는 숨긴다", () => {
    render(
      <SiteHeader
        items={[]}
        viewer={{ nickname: "코딩왕", role: "teacher", pendingGuardian: false }}
      />,
    );
    expect(screen.getByRole("button", { name: "내 계정: 코딩왕" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "로그인" })).not.toBeInTheDocument();
  });

  it("모바일 메뉴에 로그인 상태에 맞는 링크를 보여 준다", async () => {
    render(
      <SiteHeader items={[]} viewer={{ nickname: null, role: null, pendingGuardian: false }} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
    expect(screen.getByRole("link", { name: "가입 마치기" })).toHaveAttribute("href", "/signup");
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
  });

  it("그룹 메뉴는 펼침 메뉴로 하위 메뉴를 보여 준다", async () => {
    render(
      <SiteHeader
        items={[
          {
            title: "AI 코딩",
            href: "/ai-coding/python-basics",
            children: [
              { title: "파이썬 기초 코딩", href: "/ai-coding/python-basics" },
              { title: "온라인 저지", href: "https://judge.example.com", external: true },
            ],
          },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "AI 코딩" }));
    expect(screen.getByRole("menuitem", { name: "파이썬 기초 코딩" })).toHaveAttribute(
      "href",
      "/ai-coding/python-basics",
    );
    expect(screen.getByRole("menuitem", { name: /온라인 저지/ })).toHaveAttribute(
      "target",
      "_blank",
    );
  });

  it("모바일 메뉴는 그룹 제목 아래에 하위 메뉴를 펼쳐 둔다", async () => {
    render(
      <SiteHeader
        items={[
          {
            title: "AI 코딩",
            href: "/ai-coding/python-basics",
            children: [{ title: "파이썬 기초 코딩", href: "/ai-coding/python-basics" }],
          },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("link", { name: "AI 코딩" })).not.toBeInTheDocument();
    expect(within(dialog).getByText("AI 코딩")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "파이썬 기초 코딩" })).toBeInTheDocument();
  });

  it("관리자에게만 관리자 링크를 보여 준다", async () => {
    const { unmount } = render(
      <SiteHeader
        items={[]}
        viewer={{ nickname: "관리", role: "admin", pendingGuardian: false }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "내 계정: 관리" }));
    expect(screen.getByRole("menuitem", { name: "관리자" })).toHaveAttribute("href", "/admin");
    unmount();

    render(
      <SiteHeader
        items={[]}
        viewer={{ nickname: "선생", role: "teacher", pendingGuardian: false }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "내 계정: 선생" }));
    expect(screen.queryByRole("menuitem", { name: "관리자" })).not.toBeInTheDocument();
  });

  it("관리자 링크에 교사 승인 대기 수를 배지로 보여 준다", async () => {
    render(
      <SiteHeader
        items={[]}
        viewer={{ nickname: "관리", role: "admin", pendingGuardian: false, pendingTeachers: 3 }}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "내 계정: 관리" }));
    expect(screen.getByRole("menuitem", { name: /^관리자/ })).toHaveTextContent("교사 승인 대기 3");
  });

  it("검색 링크가 있다", () => {
    render(<SiteHeader items={[]} />);
    expect(screen.getByRole("link", { name: "검색" })).toHaveAttribute("href", "/search");
  });
});
