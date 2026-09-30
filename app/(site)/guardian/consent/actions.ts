"use server";

import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

import { lookupConsentToken } from "./lookup";

export type ConsentState = { error?: string };

/** 보호자 동의 처리. 링크(토큰) 소지자만 가능하며 토큰은 1회용이다. */
export async function giveGuardianConsent(
  _prev: ConsentState,
  formData: FormData,
): Promise<ConsentState> {
  const token = String(formData.get("token") ?? "");
  if (formData.get("agree") !== "on") return { error: "동의 항목을 확인하고 체크해 주세요." };

  const lookup = await lookupConsentToken(token);
  if (lookup.state !== "valid") redirect(`/guardian/consent?token=${encodeURIComponent(token)}`);

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // 동시에 두 번 눌러도 한 번만 처리되도록 미사용 조건을 걸고 갱신한다.
  const { data: used, error } = await admin
    .from("guardian_consents")
    .update({ consented_at: now })
    .eq("id", lookup.consentId)
    .is("consented_at", null)
    .is("revoked_at", null)
    .select("id");
  if (error) return { error: "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." };
  if (!used?.length) redirect(`/guardian/consent?token=${encodeURIComponent(token)}`);

  const { error: profileError } = await admin
    .from("profiles")
    .update({ status: "active", guardian_consented_at: now })
    .eq("id", lookup.profileId)
    .eq("status", "pending_guardian");
  if (profileError) return { error: "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." };

  redirect("/guardian/consent?done=1");
}
