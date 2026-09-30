import { randomBytes } from "node:crypto";

import type { BrowserContext } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

// Playwright는 .env.local을 읽지 않으므로 직접 불러온다(값이 이미 있으면 덮어쓰지 않음).
try {
  process.loadEnvFile(".env.local");
} catch {
  // CI 등에서는 환경변수로 주입한다.
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const hasSupabase = Boolean(url && anonKey && serviceKey);

export function adminClient() {
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function randomSuffix(): string {
  return randomBytes(4).toString("hex");
}

/** 테스트 전용 사용자(메일 발송 없이 생성). 테스트 후 deleteTestUser로 지운다. */
export async function createTestUser() {
  const email = `e2e+${randomSuffix()}@example.com`;
  const { data, error } = await adminClient().auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw new Error(`테스트 사용자 생성 실패: ${error?.message}`);
  return { id: data.user.id, email };
}

export async function deleteTestUser(id: string) {
  await adminClient().auth.admin.deleteUser(id);
}

/**
 * 메일 없이 로그인: 관리자 API로 로그인 코드를 발급받아 검증하고,
 * @supabase/ssr이 만든 세션 쿠키를 브라우저 컨텍스트에 넣는다.
 */
export async function loginAs(context: BrowserContext, email: string, baseURL: string) {
  const { data, error } = await adminClient().auth.admin.generateLink({ type: "magiclink", email });
  const otp = data?.properties?.email_otp;
  if (error || !otp) throw new Error(`로그인 코드 발급 실패: ${error?.message}`);

  const jar = new Map<string, string>();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const { error: verifyError } = await supabase.auth.verifyOtp({
    email,
    token: otp,
    type: "email",
  });
  if (verifyError) throw new Error(`로그인 코드 검증 실패: ${verifyError.message}`);

  await context.addCookies(
    [...jar].map(([name, value]) => ({ name, value, url: baseURL, sameSite: "Lax" as const })),
  );
}

/** 일반 사용자 세션의 supabase-js 클라이언트(RLS 검사용) */
export async function userClient(email: string) {
  const { data, error } = await adminClient().auth.admin.generateLink({ type: "magiclink", email });
  const otp = data?.properties?.email_otp;
  if (error || !otp) throw new Error(`로그인 코드 발급 실패: ${error?.message}`);
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: verifyError } = await client.auth.verifyOtp({ email, token: otp, type: "email" });
  if (verifyError) throw new Error(`로그인 코드 검증 실패: ${verifyError.message}`);
  return client;
}

/** 가입을 마친 상태의 테스트 사용자(프로필 포함) */
export async function createMember(overrides: Record<string, unknown> = {}) {
  const user = await createTestUser();
  const { error } = await adminClient()
    .from("profiles")
    .insert({
      id: user.id,
      email: user.email,
      nickname: `rls${randomSuffix()}`,
      is_under_14: false,
      privacy_agreed_at: new Date().toISOString(),
      ...overrides,
    });
  if (error) throw new Error(`테스트 프로필 생성 실패: ${error.message}`);
  return user;
}
