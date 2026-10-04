import "server-only";

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
