import { z } from "zod";

import { USER_ROLES } from "@/lib/auth/roles";
import type { Tables } from "@/types/database";

export type MenuRow = Tables<"menus">;

export const MENU_TYPES = ["series", "board", "link", "group"] as const;
export type MenuType = (typeof MENU_TYPES)[number];

export const menuTypeLabels: Record<MenuType, string> = {
  series: "게시글(차시형 문서)",
  board: "게시판",
  link: "외부 링크",
  group: "그룹",
};

/** 기존 라우트와 겹쳐 메뉴 slug로 쓸 수 없는 값. DB check 제약(p2_menus 마이그레이션)과 같게 유지한다. */
export const RESERVED_SLUGS = [
  "admin",
  "api",
  "auth",
  "guardian",
  "login",
  "logout",
  "me",
  "privacy",
  "search",
  "signup",
  "submit",
  "terms",
] as const;

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const formBoolean = z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean());

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

export const menuSlugSchema = z
  .string({ error: "주소(slug)를 입력해 주세요." })
  .trim()
  .min(1, "주소(slug)를 입력해 주세요.")
  .max(50, "주소(slug)는 50자 이하여야 합니다.")
  .regex(
    SLUG_PATTERN,
    "주소(slug)는 영문 소문자·숫자와 하이픈(-)만 쓸 수 있습니다. 예: ai-literacy",
  )
  .refine((v) => !(RESERVED_SLUGS as readonly string[]).includes(v), {
    message: "사이트에서 이미 쓰는 주소라 사용할 수 없습니다.",
  });

const menuFormSchema = z.object({
  type: z.enum(MENU_TYPES, { error: "메뉴 유형을 선택해 주세요." }),
  title: z
    .string({ error: "제목을 입력해 주세요." })
    .trim()
    .min(1, "제목을 입력해 주세요.")
    .max(30, "제목은 30자 이하여야 합니다."),
  slug: menuSlugSchema,
  parentId: optionalText.pipe(z.uuid({ error: "상위 메뉴가 올바르지 않습니다." }).optional()),
  externalUrl: optionalText,
  boardWriteRole: optionalText,
  boardAllowComments: formBoolean,
  boardAllowVotes: formBoolean,
  isActive: formBoolean,
});

/** 폼 입력을 menus 행 값으로 바꾼다. 유형에 맞지 않는 설정값은 버린다. */
export const menuInputSchema = menuFormSchema
  .superRefine((v, ctx) => {
    if (v.type === "group" && v.parentId) {
      ctx.addIssue({
        code: "custom",
        path: ["parentId"],
        message: "그룹 메뉴는 하위 메뉴가 될 수 없습니다.",
      });
    }
    if (v.type === "link") {
      if (v.externalUrl && !isHttpUrl(v.externalUrl)) {
        ctx.addIssue({
          code: "custom",
          path: ["externalUrl"],
          message: "http:// 또는 https://로 시작하는 주소를 입력해 주세요.",
        });
      } else if (!v.externalUrl && v.isActive) {
        ctx.addIssue({
          code: "custom",
          path: ["externalUrl"],
          message: "외부 주소를 입력해야 메뉴를 활성화할 수 있습니다.",
        });
      }
    }
    if (v.type === "board" && !(USER_ROLES as readonly string[]).includes(v.boardWriteRole ?? "")) {
      ctx.addIssue({
        code: "custom",
        path: ["boardWriteRole"],
        message: "글쓰기 허용 등급을 선택해 주세요.",
      });
    }
  })
  .transform((v) => ({
    type: v.type,
    title: v.title,
    slug: v.slug,
    parent_id: v.type === "group" ? null : (v.parentId ?? null),
    external_url: v.type === "link" ? (v.externalUrl ?? null) : null,
    board_write_role: v.type === "board" ? (v.boardWriteRole ?? null) : null,
    board_allow_comments: v.type === "board" ? v.boardAllowComments : true,
    board_allow_votes: v.type === "board" ? v.boardAllowVotes : true,
    is_active: v.isActive,
  }));

export type MenuInput = z.output<typeof menuInputSchema>;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
