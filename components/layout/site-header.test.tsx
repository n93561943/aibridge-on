import { render, screen } from "@testing-library/react";
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
});
