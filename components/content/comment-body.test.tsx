import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CommentBody } from "./comment-body";

describe("CommentBody", () => {
  it("링크·굵게·코드를 요소로 그리고 HTML은 글자 그대로 보인다", () => {
    const { container } = render(
      <CommentBody
        body={
          "**공지** https://example.com `x<y`\n<img src=x onerror=alert(1)>\n```\nprint(1)\n```"
        }
      />,
    );
    expect(screen.getByRole("link", { name: "https://example.com" })).toHaveAttribute(
      "rel",
      "noopener noreferrer nofollow ugc",
    );
    expect(screen.getByText("공지").closest("strong")).not.toBeNull();
    expect(screen.getByText("x<y").tagName).toBe("CODE");
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(container.querySelector("pre")?.textContent).toBe("print(1)");
  });
});
