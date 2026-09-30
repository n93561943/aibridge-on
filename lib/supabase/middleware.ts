import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isSessionExpired, withSessionMaxAge } from "@/lib/auth/session";
import { getSupabasePublicConfig } from "@/lib/env";
import type { Database } from "@/types/database";

export const PATHNAME_HEADER = "x-pathname";

/** 요청마다 Supabase 세션 쿠키를 갱신한다. 환경변수가 없으면 아무것도 하지 않는다. */
export async function updateSession(request: NextRequest) {
  // 서버 컴포넌트(레이아웃)에서 현재 경로를 알 수 있게 전달한다(가입 미완료 사용자 이동 판단용).
  request.headers.set(PATHNAME_HEADER, request.nextUrl.pathname);
  let response = NextResponse.next({ request });

  const config = getSupabasePublicConfig();
  if (!config) return response;

  const supabase = createServerClient<Database>(config.url, config.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, withSessionMaxAge(options)),
        );
      },
    },
  });

  // getUser()가 만료된 토큰을 갱신한다. 이 호출과 createServerClient 사이에 다른 코드를 넣지 않는다.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 로그인 유지 30일(F-01): 마지막 코드 로그인부터 30일이 지나면 세션(refresh token 포함)을 서버에서 끝낸다.
  if (user && isSessionExpired(user.last_sign_in_at)) {
    await supabase.auth.signOut({ scope: "local" });
  }

  return response;
}
