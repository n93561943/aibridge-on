import "server-only";

import { AI_SETTING_KEYS, type AiSettings, parseAiSettings } from "@/lib/ai/settings";
import { createClient } from "@/lib/supabase/server";

import { ONLINE_JUDGE_SETTING_KEY } from "./online-judge";

export const HOME_HERO_SETTING_KEY = "home_hero_text";

/** 온라인 저지 문제 주소 형식. 설정이 없으면 null(버튼 "준비 중"). */
export async function getOnlineJudgeTemplate(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", ONLINE_JUDGE_SETTING_KEY)
    .maybeSingle();
  return typeof data?.value === "string" ? data.value : null;
}

/** 홈 상단 문구(F-11). 설정이 없으면 null(사이트 부제를 쓴다). */
export async function getHomeHeroText(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", HOME_HERO_SETTING_KEY)
    .maybeSingle();
  return typeof data?.value === "string" && data.value.trim() ? data.value : null;
}

export const BOARD_UPLOAD_LIMIT_SETTING_KEY = "board_upload_daily_limit";

/** 회원 하루(최근 24시간) 이미지 업로드 한도. 관리자만 읽을 수 있다(설정 화면용). 없으면 null. */
export async function getBoardUploadDailyLimit(): Promise<number | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", BOARD_UPLOAD_LIMIT_SETTING_KEY)
    .maybeSingle();
  return typeof data?.value === "number" ? data.value : null;
}

/** AI 토론 주제 설정(P7). 관리자만 읽을 수 있다(설정 화면용, RLS "관리자 설정 조회"). */
export async function getAiSettings(): Promise<AiSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("site_settings")
    .select("key, value")
    .in("key", Object.values(AI_SETTING_KEYS));
  return parseAiSettings(data ?? []);
}
