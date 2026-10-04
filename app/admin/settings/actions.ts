"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

import { aiSettingsFormSchema, aiSettingsRows } from "@/lib/ai/settings";
import { requireAdmin } from "@/lib/auth/current-user";
import { POSTS_CACHE_TAG } from "@/lib/posts/public";
import { ONLINE_JUDGE_SETTING_KEY } from "@/lib/settings/online-judge";
import { BOARD_UPLOAD_LIMIT_SETTING_KEY, HOME_HERO_SETTING_KEY } from "@/lib/settings/queries";
import { createClient } from "@/lib/supabase/server";

export type SettingsState = { ok?: boolean; message?: string; errors?: Record<string, string> };

const settingsSchema = z.object({
  homeHeroText: z.string().trim().max(200, "홈 문구는 200자 이하여야 합니다."),
  onlineJudgeUrl: z
    .string()
    .trim()
    .max(300, "주소가 너무 깁니다.")
    .refine((v) => v === "" || (/^https?:\/\/\S+$/.test(v) && v.includes("{id}")), {
      message:
        "http(s)로 시작하고 문제 번호 자리 {id}가 들어간 주소를 입력해 주세요. 예: https://judge.example.com/problem/{id}",
    }),
  boardUploadLimit: z.coerce
    .number({ error: "0~1000 사이 정수를 입력해 주세요." })
    .int("0~1000 사이 정수를 입력해 주세요.")
    .min(0, "0~1000 사이 정수를 입력해 주세요.")
    .max(1000, "0~1000 사이 정수를 입력해 주세요."),
});

/** 사이트 설정 저장(/admin/settings). 비운 값은 설정을 지워 기본 동작(부제·"준비 중")으로 돌린다. */
export async function saveSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  await requireAdmin("/admin/settings");
  const parsed = settingsSchema.safeParse({
    homeHeroText: formData.get("homeHeroText") ?? "",
    onlineJudgeUrl: formData.get("onlineJudgeUrl") ?? "",
    boardUploadLimit: formData.get("boardUploadLimit") || undefined,
  });
  const ai = aiSettingsFormSchema.safeParse({
    aiEnabled: formData.get("aiEnabled"),
    aiMonthlyBudgetKrw: formData.get("aiMonthlyBudgetKrw") || undefined,
    usdKrwRate: formData.get("usdKrwRate") || undefined,
    aiDailyLimitTeacher: formData.get("aiDailyLimitTeacher") || undefined,
    aiDailyLimitAdmin: formData.get("aiDailyLimitAdmin") || undefined,
  });
  if (!parsed.success || !ai.success) {
    const errors: Record<string, string> = {};
    for (const issue of [...(parsed.error?.issues ?? []), ...(ai.error?.issues ?? [])]) {
      errors[String(issue.path[0])] ??= issue.message;
    }
    return { errors };
  }

  const supabase = await createClient();
  for (const [key, value] of [
    [HOME_HERO_SETTING_KEY, parsed.data.homeHeroText],
    [ONLINE_JUDGE_SETTING_KEY, parsed.data.onlineJudgeUrl],
  ] as const) {
    const { error } = value
      ? await supabase.from("site_settings").upsert({ key, value })
      : await supabase.from("site_settings").delete().eq("key", key);
    if (error) return { message: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
  const { error: limitError } = await supabase
    .from("site_settings")
    .upsert({ key: BOARD_UPLOAD_LIMIT_SETTING_KEY, value: parsed.data.boardUploadLimit });
  if (limitError) return { message: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  const { error: aiError } = await supabase.from("site_settings").upsert(aiSettingsRows(ai.data));
  if (aiError) return { message: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };

  revalidateTag(POSTS_CACHE_TAG);
  revalidatePath("/", "layout");
  return { ok: true, message: "설정을 저장했습니다. 사이트에 바로 반영됩니다." };
}
