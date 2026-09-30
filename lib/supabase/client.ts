import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicConfig } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * 브라우저(클라이언트 컴포넌트)용 Supabase 클라이언트.
 * 로그인·로그아웃은 Server Action에서 처리한다(세션 쿠키 30일 유지 규칙은 서버 쪽에서 적용).
 */
export function createClient() {
  const config = getSupabasePublicConfig();
  if (!config) {
    throw new Error(
      "Supabase 환경변수(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)가 설정되지 않았습니다.",
    );
  }
  return createBrowserClient<Database>(config.url, config.anonKey);
}
