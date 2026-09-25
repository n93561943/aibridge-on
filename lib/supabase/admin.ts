import "server-only";
import { createClient } from "@supabase/supabase-js";

import { getSupabasePublicConfig } from "@/lib/env";
import { getServerEnv } from "@/lib/env.server";
import type { Database } from "@/types/database";

/**
 * service role 클라이언트. RLS를 우회하므로 서버에서, 권한 검사를 마친 뒤에만 사용한다.
 */
export function createAdminClient() {
  const config = getSupabasePublicConfig();
  const { SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();
  if (!config || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Supabase 관리자 환경변수(SUPABASE_SERVICE_ROLE_KEY 등)가 설정되지 않았습니다.",
    );
  }
  return createClient<Database>(config.url, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
