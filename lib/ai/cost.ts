/** 토큰 수 × 모델 단가(USD/100만 토큰, 환경변수) × 환율(site_settings) → 원. 소수 둘째 자리까지. */
export function costKrw(
  usage: { inputTokens: number; outputTokens: number },
  prices: { inputUsdPerMtok: number; outputUsdPerMtok: number },
  usdKrwRate: number,
): number {
  const usd =
    (usage.inputTokens * prices.inputUsdPerMtok + usage.outputTokens * prices.outputUsdPerMtok) /
    1_000_000;
  return Math.round(usd * usdKrwRate * 100) / 100;
}
