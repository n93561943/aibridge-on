import { createHash, randomBytes } from "node:crypto";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** URL에 넣을 수 있는 난수 토큰(base64url). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
