/** 게시물 첨부 파일 버킷(p3_posts 마이그레이션에서 생성, 공개 읽기) */
export const POST_FILES_BUCKET = "post-files";

/** 휴지통 보관 기간. 지나면 Cron(/api/cron/purge-trash)이 영구 삭제한다(F-06). */
export const TRASH_RETENTION_DAYS = 30;

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** 이미지로 올릴 수 있는 형식. SVG는 스크립트를 담을 수 있어 받지 않는다. */
export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
