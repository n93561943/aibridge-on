import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="container-site flex min-h-dvh flex-col items-center justify-center gap-4 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-2xl font-bold">페이지를 찾을 수 없습니다</h1>
      <p className="text-muted-foreground">주소가 바뀌었거나 삭제된 페이지일 수 있습니다.</p>
      <Button asChild>
        <Link href="/">홈으로 가기</Link>
      </Button>
    </main>
  );
}
