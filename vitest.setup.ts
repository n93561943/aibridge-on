import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// server-only는 Next 번들러 밖(Vitest)에서는 항상 throw하므로 테스트에서만 무력화한다.
vi.mock("server-only", () => ({}));

afterEach(() => {
  cleanup();
});
