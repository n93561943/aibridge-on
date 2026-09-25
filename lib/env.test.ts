import { describe, expect, it } from "vitest";

import { getSupabasePublicConfig, parsePublicEnv } from "@/lib/env";
import { parseServerEnv } from "@/lib/env.server";

describe("parsePublicEnv", () => {
  it("값이 없으면 사이트 주소 기본값을 쓰고 Supabase는 미설정으로 본다", () => {
    const env = parsePublicEnv({});
    expect(env.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
    expect(getSupabasePublicConfig(env)).toBeNull();
  });

  it("빈 문자열은 미설정으로 취급한다", () => {
    const env = parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "" });
    expect(getSupabasePublicConfig(env)).toBeNull();
  });

  it("사이트 주소 끝의 슬래시를 제거한다", () => {
    const env = parsePublicEnv({ NEXT_PUBLIC_SITE_URL: "https://example.com/" });
    expect(env.NEXT_PUBLIC_SITE_URL).toBe("https://example.com");
  });

  it("Supabase URL·키가 모두 있으면 설정을 반환한다", () => {
    const env = parsePublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    });
    expect(getSupabasePublicConfig(env)).toEqual({
      url: "https://abc.supabase.co",
      anonKey: "anon",
    });
  });

  it("잘못된 URL은 거부한다", () => {
    expect(() => parsePublicEnv({ NEXT_PUBLIC_SITE_URL: "not-a-url" })).toThrow();
    expect(() => parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "nope" })).toThrow();
  });
});

describe("parseServerEnv", () => {
  it("ADMIN_EMAILS를 소문자 배열로 나눈다", () => {
    const env = parseServerEnv({ ADMIN_EMAILS: " Admin@Example.com, b@example.com ,," });
    expect(env.ADMIN_EMAILS).toEqual(["admin@example.com", "b@example.com"]);
  });

  it("AI 단가·모델 기본값을 채운다", () => {
    const env = parseServerEnv({});
    expect(env.ANTHROPIC_MODEL).toBe("claude-haiku-4-5");
    expect(env.AI_PRICE_INPUT_USD_PER_MTOK).toBe(1);
    expect(env.AI_PRICE_OUTPUT_USD_PER_MTOK).toBe(5);
    expect(env.ADMIN_EMAILS).toEqual([]);
  });
});
