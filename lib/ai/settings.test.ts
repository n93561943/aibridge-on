import { describe, expect, it } from "vitest";

import {
  AI_SETTING_DEFAULTS,
  aiSettingsFormSchema,
  aiSettingsRows,
  parseAiSettings,
} from "./settings";

describe("AI 설정", () => {
  it("없거나 형식이 틀린 값은 안전한 기본값(꺼짐)으로", () => {
    expect(parseAiSettings([])).toEqual(AI_SETTING_DEFAULTS);
    expect(AI_SETTING_DEFAULTS.enabled).toBe(false);
    expect(
      parseAiSettings([
        { key: "ai_enabled", value: "true" },
        { key: "ai_monthly_budget_krw", value: 5000 },
        { key: "usd_krw_rate", value: "1400" },
      ]),
    ).toEqual({ ...AI_SETTING_DEFAULTS, monthlyBudgetKrw: 5000 });
  });

  it("폼: 체크박스·숫자 범위", () => {
    const ok = aiSettingsFormSchema.parse({
      aiEnabled: "on",
      aiMonthlyBudgetKrw: "10000",
      usdKrwRate: "1400",
      aiDailyLimitTeacher: "20",
      aiDailyLimitAdmin: "50",
    });
    expect(ok.aiEnabled).toBe(true);
    expect(aiSettingsRows(ok)).toContainEqual({ key: "ai_monthly_budget_krw", value: 10000 });
    expect(
      aiSettingsFormSchema.safeParse({ ...ok, aiEnabled: undefined, usdKrwRate: "50" }).success,
    ).toBe(false);
    expect(aiSettingsFormSchema.parse({ ...ok, aiEnabled: undefined }).aiEnabled).toBe(false);
    expect(aiSettingsFormSchema.safeParse({ ...ok, aiDailyLimitTeacher: "2.5" }).success).toBe(
      false,
    );
  });
});
