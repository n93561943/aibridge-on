import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabasePublicConfig } from "@/lib/env";
import type { Database } from "@/types/database";

export type SearchHit = {
  id: string;
  menuId: string;
  title: string;
  slug: string;
  lessonNo: number | null;
  summary: string | null;
  /** 본문에서 검색어 앞뒤를 자른 미리보기(최대 200자) */
  snippet: string;
};

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 50;

/**
 * 통합 검색(F-10). 로그인과 상관없이 비회원 권한(anon)으로 검색해 공개 글만 나오게 한다
 * (관리자 세션으로 검색하면 초안까지 나오므로).
 */
export async function searchPosts(query: string, menuId?: string): Promise<SearchHit[]> {
  const config = getSupabasePublicConfig();
  const q = query.trim();
  if (!config || q.length < SEARCH_MIN_LENGTH || q.length > SEARCH_MAX_LENGTH) return [];
  const anon = createClient<Database>(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.rpc("search_posts", {
    p_query: q,
    ...(menuId ? { p_menu_id: menuId } : {}),
    p_limit: 50,
  });
  if (error) throw new Error(`검색 실패: ${error.message}`);
  return data.map((row) => ({
    id: row.id,
    menuId: row.menu_id,
    title: row.title,
    slug: row.slug,
    lessonNo: row.lesson_no,
    summary: row.summary,
    snippet: (row.snippet ?? "").replace(/\s+/g, " ").trim(),
  }));
}
