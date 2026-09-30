import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";

import { toUserRole } from "@/lib/auth/roles";
import { getSupabasePublicConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type Profile = Tables<"profiles">;

export type CurrentUser = {
  id: string;
  email: string;
  /** 가입(/signup)을 마치지 않았으면 null */
  profile: Profile | null;
};

/** 요청당 1회만 조회한다(React cache). 비로그인·Supabase 미설정이면 null. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  if (!getSupabasePublicConfig()) return null;
  const supabase = await createClient();
  // getUser()는 Auth 서버에 토큰을 검증받는다(쿠키 값만 믿지 않음).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return { id: user.id, email: user.email, profile };
});

/** 로그인 필수. 비로그인이면 /login으로 보낸다. */
export async function requireUser(nextPath?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  return user;
}

/** 가입 완료 회원 필수. 가입 전이면 /signup으로 보낸다. */
export async function requireMember(
  nextPath?: string,
): Promise<CurrentUser & { profile: Profile }> {
  const user = await requireUser(nextPath);
  if (!user.profile) redirect("/signup");
  return user as CurrentUser & { profile: Profile };
}

/** 관리자 필수. 정지된 관리자는 거부한다. */
export async function requireAdmin(): Promise<CurrentUser & { profile: Profile }> {
  const user = await requireMember();
  if (toUserRole(user.profile.role) !== "admin" || user.profile.status !== "active") redirect("/");
  return user;
}
