import { z } from "zod";

/**
 * AI 토론 주제 설정(site_settings, P7). DB 기본값은 p7_ai_generations 마이그레이션이 넣고,
 * 값이 없으면 안전한 쪽(꺼짐·SPEC 기본값)으로 본다. 예약 함수(ai_reserve_generation)도 같은 키를 읽는다.
 */
export const AI_SETTING_KEYS = {
  enabled: "ai_enabled",
  monthlyBudgetKrw: "ai_monthly_budget_krw",
  usdKrwRate: "usd_krw_rate",
  dailyLimitTeacher: "ai_daily_limit_teacher",
  dailyLimitAdmin: "ai_daily_limit_admin",
} as const;

export type AiSettings = {
  enabled: boolean;
  monthlyBudgetKrw: number;
  usdKrwRate: number;
  dailyLimitTeacher: number;
  dailyLimitAdmin: number;
};

export const AI_SETTING_DEFAULTS: AiSettings = {
  enabled: false,
  monthlyBudgetKrw: 10000,
  usdKrwRate: 1400,
  dailyLimitTeacher: 20,
  dailyLimitAdmin: 50,
};

/** site_settings 행 → 설정. 형식이 틀린 값은 기본값으로. */
export function parseAiSettings(rows: { key: string; value: unknown }[]): AiSettings {
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const num = (key: string, fallback: number) => {
    const v = byKey.get(key);
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
  };
  const enabled = byKey.get(AI_SETTING_KEYS.enabled);
  return {
    enabled: typeof enabled === "boolean" ? enabled : AI_SETTING_DEFAULTS.enabled,
    monthlyBudgetKrw: num(AI_SETTING_KEYS.monthlyBudgetKrw, AI_SETTING_DEFAULTS.monthlyBudgetKrw),
    usdKrwRate: num(AI_SETTING_KEYS.usdKrwRate, AI_SETTING_DEFAULTS.usdKrwRate),
    dailyLimitTeacher: num(
      AI_SETTING_KEYS.dailyLimitTeacher,
      AI_SETTING_DEFAULTS.dailyLimitTeacher,
    ),
    dailyLimitAdmin: num(AI_SETTING_KEYS.dailyLimitAdmin, AI_SETTING_DEFAULTS.dailyLimitAdmin),
  };
}

const int = (min: number, max: number, label: string) =>
  z.coerce
    .number({ error: `${label}: ${min}~${max} 사이 정수를 입력해 주세요.` })
    .int(`${label}: ${min}~${max} 사이 정수를 입력해 주세요.`)
    .min(min, `${label}: ${min}~${max} 사이 정수를 입력해 주세요.`)
    .max(max, `${label}: ${min}~${max} 사이 정수를 입력해 주세요.`);

/** 관리자 설정 폼 검증(DB check 제약과 같은 범위) */
export const aiSettingsFormSchema = z.object({
  aiEnabled: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  aiMonthlyBudgetKrw: int(0, 10_000_000, "월 예산"),
  usdKrwRate: int(100, 10_000, "환율"),
  aiDailyLimitTeacher: int(0, 1000, "교사 일일 한도"),
  aiDailyLimitAdmin: int(0, 1000, "관리자 일일 한도"),
});

export type AiSettingsForm = z.infer<typeof aiSettingsFormSchema>;

/** 폼 값 → site_settings 행 */
export function aiSettingsRows(form: AiSettingsForm): { key: string; value: boolean | number }[] {
  return [
    { key: AI_SETTING_KEYS.enabled, value: form.aiEnabled },
    { key: AI_SETTING_KEYS.monthlyBudgetKrw, value: form.aiMonthlyBudgetKrw },
    { key: AI_SETTING_KEYS.usdKrwRate, value: form.usdKrwRate },
    { key: AI_SETTING_KEYS.dailyLimitTeacher, value: form.aiDailyLimitTeacher },
    { key: AI_SETTING_KEYS.dailyLimitAdmin, value: form.aiDailyLimitAdmin },
  ];
}
