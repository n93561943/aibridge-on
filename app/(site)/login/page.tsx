import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/current-user";
import { safeNextPath } from "@/lib/auth/redirect";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "로그인" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNextPath((await searchParams).next);
  const user = await getCurrentUser();
  if (user) redirect(user.profile ? next : "/signup");

  return (
    <div className="container-site flex justify-center py-10 sm:py-16">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            <h1>로그인</h1>
          </CardTitle>
          <CardDescription>이메일로 받은 코드로 로그인하거나 가입합니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm next={next} />
        </CardContent>
      </Card>
    </div>
  );
}
