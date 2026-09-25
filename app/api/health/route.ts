import { NextResponse } from "next/server";

import { getSupabasePublicConfig } from "@/lib/env";

export const dynamic = "force-dynamic";

type SupabaseStatus = "ok" | "error" | "not_configured";

async function checkSupabase(): Promise<SupabaseStatus> {
  const config = getSupabasePublicConfig();
  if (!config) return "not_configured";
  try {
    const res = await fetch(`${config.url}/auth/v1/health`, {
      headers: { apikey: config.anonKey },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}

/** 배포·연결 상태 확인용. 비밀값은 응답에 넣지 않는다. */
export async function GET() {
  const supabase = await checkSupabase();
  return NextResponse.json(
    { app: "ok", supabase, time: new Date().toISOString() },
    { status: supabase === "error" ? 503 : 200 },
  );
}
