import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";

import { getSupabasePublicConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

import type { MenuRow } from "./schema";
import { buildMenuTree, type MenuNode, type NavItem, toNavItems } from "./tree";

/** 메뉴를 바꾸면 revalidateTag(MENUS_CACHE_TAG)로 헤더·메뉴 페이지 캐시를 바로 지운다. */
export const MENUS_CACHE_TAG = "menus";

/**
 * 공개 메뉴(활성만). 모든 방문자에게 같으므로 쿠키 없는 anon 클라이언트로 읽어 캐시한다.
 * 조회 실패는 throw해서 캐시에 남기지 않는다.
 */
const fetchActiveMenus = unstable_cache(
  async (): Promise<MenuRow[]> => {
    const config = getSupabasePublicConfig();
    if (!config) return [];
    const supabase = createSupabaseClient<Database>(config.url, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.from("menus").select("*").eq("is_active", true);
    if (error) throw new Error(`메뉴 조회 실패: ${error.message}`);
    return data;
  },
  ["active-menus"],
  { tags: [MENUS_CACHE_TAG], revalidate: 3600 },
);

/** 공개 메뉴 트리. 조회에 실패해도 사이트는 떠야 하므로 빈 목록을 돌려준다. */
export async function getPublicMenuTree(): Promise<MenuNode[]> {
  try {
    return buildMenuTree(await fetchActiveMenus());
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function getNavItems(): Promise<NavItem[]> {
  return toNavItems(await getPublicMenuTree());
}

/** 관리자 화면용 전체 메뉴(비활성 포함). 사용자 세션으로 읽으므로 RLS가 관리자만 허용한다. */
export async function getAdminMenuTree(): Promise<MenuNode[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("menus").select("*");
  if (error) throw new Error(`메뉴 조회 실패: ${error.message}`);
  return buildMenuTree(data);
}
