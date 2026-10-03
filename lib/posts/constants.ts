/** 게시물 첨부 파일 버킷(p3_posts 마이그레이션에서 생성, 공개 읽기) */
export const POST_FILES_BUCKET = "post-files";

/** 휴지통 보관 기간. 지나면 Cron(/api/cron/purge-trash)이 영구 삭제한다(F-06). */
export const TRASH_RETENTION_DAYS = 30;

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** 이미지로 올릴 수 있는 형식. SVG는 스크립트를 담을 수 있어 받지 않는다. */
export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

/** 파일 블록으로 올릴 수 있는 형식(버킷 allowed_mime_types와 같게 유지). */
export const FILE_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "text/plain",
  "text/csv",
  "text/x-python",
  "application/x-ipynb+json",
  "application/json",
  "application/x-hwp",
  "application/haansofthwp",
  "application/vnd.hancom.hwp",
  "application/vnd.hancom.hwpx",
  "application/hwp+zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/octet-stream",
] as const;

/** 브라우저가 형식을 모르는 파일(.hwp, .py 등)은 확장자로 정한다. */
const MIME_BY_EXTENSION: Record<string, string> = {
  hwp: "application/x-hwp",
  hwpx: "application/vnd.hancom.hwpx",
  py: "text/x-python",
  ipynb: "application/x-ipynb+json",
  csv: "text/csv",
  txt: "text/plain",
  zip: "application/zip",
  pdf: "application/pdf",
};

export function resolveMimeType(fileName: string, browserType: string): string {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (browserType && browserType !== "application/octet-stream") return browserType;
  return MIME_BY_EXTENSION[ext] ?? "application/octet-stream";
}

export function isImageMime(mime: string): boolean {
  return (IMAGE_MIME_TYPES as readonly string[]).includes(mime);
}

/** 업로드 가능 여부. 오류 문구 또는 null. */
export function uploadError(mime: string, size: number): string | null {
  if (!(FILE_MIME_TYPES as readonly string[]).includes(mime)) {
    return "올릴 수 없는 파일 형식입니다(SVG·HTML·실행 파일 등은 안 됩니다).";
  }
  if (size <= 0) return "빈 파일은 올릴 수 없습니다.";
  if (isImageMime(mime) && size > MAX_IMAGE_BYTES) return "이미지는 10MB 이하만 올릴 수 있습니다.";
  if (size > MAX_FILE_BYTES) return "파일은 50MB 이하만 올릴 수 있습니다.";
  return null;
}

/** Storage 경로용 파일 이름: 영문·숫자·.-_만 남긴다(한글 이름은 attachments.file_name에 보관). */
export function storageSafeName(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const safeExt = /^[a-z0-9]{1,10}$/.test(ext) ? `.${ext}` : "";
  const base = fileName
    .slice(0, fileName.length - (safeExt ? safeExt.length : 0))
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "file"}${safeExt}`;
}
