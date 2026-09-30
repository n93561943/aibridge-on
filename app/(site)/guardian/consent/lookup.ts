import "server-only";

import {
  evaluateGuardianToken,
  hashGuardianToken,
  type GuardianTokenState,
} from "@/lib/guardian/token";
import { maskEmail } from "@/lib/privacy";
import { createAdminClient } from "@/lib/supabase/admin";

export type ConsentLookup =
  | { state: Exclude<GuardianTokenState, "valid">; consentId?: undefined }
  | {
      state: "valid";
      consentId: string;
      profileId: string;
      nickname: string;
      maskedEmail: string;
    };

export async function lookupConsentToken(token: string | undefined): Promise<ConsentLookup> {
  if (!token || token.length > 200) return { state: "not_found" };
  const admin = createAdminClient();
  const { data } = await admin
    .from("guardian_consents")
    .select(
      "id, expires_at, consented_at, revoked_at, profile:profiles(id, nickname, email, status)",
    )
    .eq("token_hash", hashGuardianToken(token))
    .maybeSingle();

  if (!data?.profile) return { state: "not_found" };
  const state = evaluateGuardianToken(data);
  if (state !== "valid") return { state };
  // 이미 다른 링크로 동의가 끝난 계정
  if (data.profile.status !== "pending_guardian") return { state: "used" };

  return {
    state: "valid",
    consentId: data.id,
    profileId: data.profile.id,
    nickname: data.profile.nickname,
    maskedEmail: maskEmail(data.profile.email),
  };
}
