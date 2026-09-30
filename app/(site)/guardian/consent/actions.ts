"use server";

import { redirect } from "next/navigation";

import { hashGuardianToken } from "@/lib/guardian/token";
import { createAdminClient } from "@/lib/supabase/admin";

export type ConsentState = { error?: string };

/** 보호자 동의 처리. 링크(토큰) 소지자만 가능하며 토큰은 1회용이다. */
export async function giveGuardianConsent(
  _prev: ConsentState,
  formData: FormData,
): Promise<ConsentState> {
  const token = String(formData.get("token") ?? "");
  if (!token || token.length > 200) redirect("/guardian/consent");
  if (formData.get("agree") !== "on") return { error: "동의 항목을 확인하고 체크해 주세요." };

  // 토큰 1회 사용 처리와 계정 활성화를 DB 함수 한 번(트랜잭션)으로 처리한다.
  const { data, error } = await createAdminClient().rpc("give_guardian_consent", {
    p_token_hash: hashGuardianToken(token),
  });
  if (error) return { error: "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." };
  if (data !== "ok") redirect(`/guardian/consent?token=${encodeURIComponent(token)}`);

  redirect("/guardian/consent?done=1");
}
