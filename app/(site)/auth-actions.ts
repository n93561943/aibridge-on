"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSupabasePublicConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/** 로그아웃: 이 기기의 세션만 끝낸다. */
export async function signOut() {
  if (getSupabasePublicConfig()) {
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "local" });
  }
  revalidatePath("/", "layout");
  redirect("/");
}
