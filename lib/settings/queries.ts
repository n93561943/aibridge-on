import "server-only";

import { createClient } from "@/lib/supabase/server";

import { ONLINE_JUDGE_SETTING_KEY } from "./online-judge";

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
