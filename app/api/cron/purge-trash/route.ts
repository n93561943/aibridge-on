import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { getServerEnv } from "@/lib/env.server";
import { purgeExpiredTrash } from "@/lib/posts/purge";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function isAuthorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * 휴지통 30일 경과 게시물 영구 삭제. Vercel Cron이 하루 한 번 호출한다(vercel.json).
 * Vercel은 CRON_SECRET이 설정되어 있으면 Authorization: Bearer <값>을 붙여 보낸다.
 */
export async function GET(request: Request) {
  const { CRON_SECRET } = getServerEnv();
  if (!CRON_SECRET || CRON_SECRET.length < 16) {
    return NextResponse.json(
      { error: "CRON_SECRET이 없거나 너무 짧습니다(16자 이상)." },
      { status: 503 },
    );
  }
  if (!isAuthorized(request.headers.get("authorization"), CRON_SECRET)) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  try {
    const result = await purgeExpiredTrash(createAdminClient());
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, error: "휴지통 정리에 실패했습니다." }, { status: 500 });
  }
}
