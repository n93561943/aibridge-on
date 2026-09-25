import { z } from "zod";

// 빈 문자열은 "설정 안 됨"으로 취급한다.
const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  // P0에서는 Supabase 프로젝트가 없어도 빌드·배포되도록 선택값으로 둔다.
  NEXT_PUBLIC_SUPABASE_URL: optionalString.pipe(z.url().optional()),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const siteUrl = source.NEXT_PUBLIC_SITE_URL?.trim();
  return publicEnvSchema.parse({
    NEXT_PUBLIC_SITE_URL: siteUrl ? siteUrl.replace(/\/+$/, "") : undefined,
    NEXT_PUBLIC_SUPABASE_URL: source.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: source.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

// NEXT_PUBLIC_* 값은 빌드 시 인라인되므로 process.env.X 형태로 직접 참조해야 한다.
export const publicEnv = parsePublicEnv({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

export type SupabasePublicConfig = { url: string; anonKey: string };

/** Supabase 공개 설정. 아직 설정되지 않았으면 null. */
export function getSupabasePublicConfig(env: PublicEnv = publicEnv): SupabasePublicConfig | null {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
}
