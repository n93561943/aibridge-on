"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/current-user";
import { MENUS_CACHE_TAG } from "@/lib/menus/queries";
import { menuInputSchema } from "@/lib/menus/schema";
import { createClient } from "@/lib/supabase/server";

export type MenuFormState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
  /** 실패 시 입력값(React 19는 action 뒤에 폼을 초기화하므로 다시 채운다) */
  values?: Record<string, string>;
};
export type MenuActionResult = { ok: boolean; message?: string };

const ADMIN_PATH = "/admin/menus";
const idSchema = z.uuid();

/** 헤더(모든 공개 페이지)와 관리자 화면 캐시를 지워 변경을 즉시 반영한다(F-04). */
function revalidateMenus() {
  revalidateTag(MENUS_CACHE_TAG);
  revalidatePath(ADMIN_PATH);
}

/** DB 오류를 화면 문구로. 트리거가 올린 한국어 메시지는 그대로 보여 준다. */
function dbErrorMessage(error: PostgrestError, fallback: string): MenuFormState {
  if (error.code === "23505") return { errors: { slug: "이미 쓰고 있는 주소(slug)입니다." } };
  if (error.code === "23503") return { message: "하위 메뉴가 있어 삭제할 수 없습니다." };
  if (/[가-힣]/.test(error.message)) return { message: error.message };
  return { message: fallback };
}

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) errors[String(issue.path[0] ?? "form")] ??= issue.message;
  return errors;
}

function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData) if (typeof value === "string") values[key] = value;
  return values;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** 같은 상위 메뉴 안에서 맨 뒤 순서 */
async function nextSortOrder(supabase: Supabase, parentId: string | null): Promise<number> {
  let query = supabase
    .from("menus")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  query = parentId ? query.eq("parent_id", parentId) : query.is("parent_id", null);
  const { data } = await query;
  return (data?.[0]?.sort_order ?? 0) + 1;
}

export async function createMenu(_prev: MenuFormState, formData: FormData): Promise<MenuFormState> {
  await requireAdmin(ADMIN_PATH);
  const values = formValues(formData);
  const parsed = menuInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error.issues), values };

  const supabase = await createClient();
  const sort_order = await nextSortOrder(supabase, parsed.data.parent_id);
  const { error } = await supabase.from("menus").insert({ ...parsed.data, sort_order });
  if (error) {
    return {
      ...dbErrorMessage(error, "메뉴를 만들지 못했습니다. 잠시 후 다시 시도해 주세요."),
      values,
    };
  }

  revalidateMenus();
  return { ok: true, message: `'${parsed.data.title}' 메뉴를 만들었습니다.` };
}

export async function updateMenu(
  id: string,
  _prev: MenuFormState,
  formData: FormData,
): Promise<MenuFormState> {
  await requireAdmin(ADMIN_PATH);
  if (!idSchema.safeParse(id).success) return { message: "메뉴를 찾을 수 없습니다." };
  const values = formValues(formData);
  const parsed = menuInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error.issues), values };

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("menus")
    .select("parent_id")
    .eq("id", id)
    .maybeSingle();
  if (!current) return { message: "메뉴를 찾을 수 없습니다. 새로고침해 주세요.", values };

  // 다른 상위 메뉴로 옮기면 그곳의 맨 뒤에 둔다.
  const moved = current.parent_id !== parsed.data.parent_id;
  const sort_order = moved ? await nextSortOrder(supabase, parsed.data.parent_id) : undefined;
  const { error } = await supabase
    .from("menus")
    .update({ ...parsed.data, ...(sort_order === undefined ? {} : { sort_order }) })
    .eq("id", id);
  if (error) {
    return {
      ...dbErrorMessage(error, "메뉴를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."),
      values,
    };
  }

  revalidateMenus();
  return { ok: true, message: `'${parsed.data.title}' 메뉴를 저장했습니다.` };
}

export async function setMenuActive(id: string, isActive: boolean): Promise<MenuActionResult> {
  await requireAdmin(ADMIN_PATH);
  if (!idSchema.safeParse(id).success || typeof isActive !== "boolean") {
    return { ok: false, message: "잘못된 요청입니다." };
  }

  const supabase = await createClient();
  const { data: menu } = await supabase
    .from("menus")
    .select("title, type, external_url")
    .eq("id", id)
    .maybeSingle();
  if (!menu) return { ok: false, message: "메뉴를 찾을 수 없습니다. 새로고침해 주세요." };
  if (isActive && menu.type === "link" && !menu.external_url) {
    return { ok: false, message: "외부 주소를 먼저 입력해야 활성화할 수 있습니다." };
  }

  const { error } = await supabase.from("menus").update({ is_active: isActive }).eq("id", id);
  if (error) return { ok: false, ...dbErrorMessage(error, "상태를 바꾸지 못했습니다.") };

  revalidateMenus();
  return {
    ok: true,
    message: `'${menu.title}' 메뉴를 ${isActive ? "활성화" : "비활성화"}했습니다.`,
  };
}

/**
 * 메뉴 삭제. 하위 메뉴가 있으면 막는다.
 * 게시물이 있는 메뉴의 처리(다른 메뉴로 옮기기·함께 휴지통)는 posts가 생기는 P3에서 추가한다.
 */
export async function deleteMenu(id: string): Promise<MenuActionResult> {
  await requireAdmin(ADMIN_PATH);
  if (!idSchema.safeParse(id).success) return { ok: false, message: "잘못된 요청입니다." };

  const supabase = await createClient();
  const { count } = await supabase
    .from("menus")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", id);
  if (count) {
    return { ok: false, message: "하위 메뉴가 있습니다. 하위 메뉴를 먼저 옮기거나 삭제해 주세요." };
  }

  const { data, error } = await supabase.from("menus").delete().eq("id", id).select("title");
  if (error) return { ok: false, ...dbErrorMessage(error, "메뉴를 삭제하지 못했습니다.") };
  if (!data?.length) return { ok: false, message: "메뉴를 찾을 수 없습니다. 새로고침해 주세요." };

  revalidateMenus();
  return { ok: true, message: `'${data[0].title}' 메뉴를 삭제했습니다.` };
}

const reorderSchema = z.object({
  parentId: z.uuid().nullable(),
  ids: z.array(z.uuid()).min(1).max(200),
});

/** 같은 상위 메뉴 안의 순서 변경(드래그·위아래 버튼) */
export async function reorderMenus(
  parentId: string | null,
  ids: string[],
): Promise<MenuActionResult> {
  await requireAdmin(ADMIN_PATH);
  const parsed = reorderSchema.safeParse({ parentId, ids });
  if (!parsed.success) return { ok: false, message: "잘못된 요청입니다." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reorder_menus", {
    p_ids: parsed.data.ids,
    ...(parsed.data.parentId ? { p_parent_id: parsed.data.parentId } : {}),
  });
  if (error) return { ok: false, ...dbErrorMessage(error, "순서를 바꾸지 못했습니다.") };

  revalidateMenus();
  return { ok: true, message: "순서를 바꿨습니다." };
}
