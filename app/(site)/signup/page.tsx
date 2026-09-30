import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/current-user";
import { safeNextPath } from "@/lib/auth/redirect";

import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "가입 정보 입력" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/signup");
  if (user.profile) redirect("/me");
  const next = safeNextPath((await searchParams).next);

  return (
    <div className="container-site flex justify-center py-10 sm:py-16">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            <h1>가입 정보 입력</h1>
          </CardTitle>
          <CardDescription>
            처음 로그인하셨네요. 몇 가지 정보만 입력하면 가입이 끝납니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignupForm email={user.email} next={next} />
        </CardContent>
      </Card>
    </div>
  );
}
