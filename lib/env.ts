import { z } from "zod";

// 빈 문자열은 "설정 안 됨"으로 취급한다.
const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const LOCAL_SITE_URL = "http://localhost:3000";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url(),
  // P0에서는 Supabase 프로젝트가 없어도 빌드·배포되도록 선택값으로 둔다.
  NEXT_PUBLIC_SUPABASE_URL: optionalString.pipe(z.url().optional()),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/**
 * 사이트 주소 결정 순서: NEXT_PUBLIC_SITE_URL → (Vercel Preview) 배포 주소 → 로컬 기본값.
 * Vercel 운영(production) 배포에서 값이 없으면 메일 링크가 localhost로 나가므로 빌드를 실패시킨다.
 */
function resolveSiteUrl(source: Record<string, string | undefined>): string {
  const siteUrl = source.NEXT_PUBLIC_SITE_URL?.trim();
  if (siteUrl) return siteUrl.replace(/\/+$/, "");

  const vercelEnv = source.NEXT_PUBLIC_VERCEL_ENV?.trim() || source.VERCEL_ENV?.trim();
  if (vercelEnv === "production") {
    throw new Error("운영 환경에서는 NEXT_PUBLIC_SITE_URL 환경변수가 반드시 필요합니다.");
  }

  const vercelUrl = source.NEXT_PUBLIC_VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/\/+$/, "")}`;

  return LOCAL_SITE_URL;
}

export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_SITE_URL: resolveSiteUrl(source),
    NEXT_PUBLIC_SUPABASE_URL: source.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: source.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

// NEXT_PUBLIC_* 값은 빌드 시 인라인되므로 process.env.X 형태로 직접 참조해야 한다.
export const publicEnv = parsePublicEnv({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  // Vercel 시스템 환경변수(자동 노출). VERCEL_ENV는 서버·빌드에서만 보인다.
  NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
  NEXT_PUBLIC_VERCEL_URL: process.env.NEXT_PUBLIC_VERCEL_URL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

export type SupabasePublicConfig = { url: string; anonKey: string };

/** Supabase 공개 설정. 아직 설정되지 않았으면 null. */
export function getSupabasePublicConfig(env: PublicEnv = publicEnv): SupabasePublicConfig | null {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
}
