import Link from "next/link";

import { cn } from "@/lib/utils";
import { siteConfig } from "@/lib/site";

/** 텍스트 워드마크. 로고 시안 확정 후 이 컴포넌트만 SVG로 교체한다. */
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn("inline-flex items-baseline text-lg font-bold tracking-tight", className)}
      aria-label={`${siteConfig.name} 홈`}
    >
      <span>AI Bridge</span>
      <span className="text-brand">:ON</span>
    </Link>
  );
}
