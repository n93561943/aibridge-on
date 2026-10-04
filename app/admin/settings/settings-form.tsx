"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { saveSettings, type SettingsState } from "./actions";

export function SettingsForm({
  homeHeroText,
  onlineJudgeUrl,
  boardUploadLimit,
  defaultTagline,
}: {
  homeHeroText: string;
  onlineJudgeUrl: string;
  boardUploadLimit: number;
  defaultTagline: string;
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettings, {});
  const errors = state.errors ?? {};
  return (
    <form action={action} className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2 rounded-xl border bg-background p-4">
        <legend className="px-1 font-semibold">홈 화면</legend>
        <Label htmlFor="homeHeroText">홈 문구</Label>
        <textarea
          id="homeHeroText"
          name="homeHeroText"
          defaultValue={homeHeroText}
          maxLength={200}
          rows={3}
          placeholder={defaultTagline}
          aria-invalid={!!errors.homeHeroText || undefined}
          aria-describedby="homeHeroText-hint homeHeroText-error"
          className="w-full rounded-lg border bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
        />
        <p id="homeHeroText-hint" className="text-xs text-muted-foreground">
          홈 맨 위 로고 아래에 보입니다. 비우면 기본 부제(&lsquo;{defaultTagline}&rsquo;)를 씁니다.
          줄바꿈도 그대로 보입니다.
        </p>
        <p id="homeHeroText-error" className="text-sm text-destructive empty:hidden">
          {errors.homeHeroText}
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-2 rounded-xl border bg-background p-4">
        <legend className="px-1 font-semibold">온라인 저지</legend>
        <Label htmlFor="onlineJudgeUrl">문제 주소 형식</Label>
        <Input
          id="onlineJudgeUrl"
          name="onlineJudgeUrl"
          type="url"
          inputMode="url"
          defaultValue={onlineJudgeUrl}
          placeholder="https://judge.example.com/problem/{id}"
          aria-invalid={!!errors.onlineJudgeUrl || undefined}
          aria-describedby="onlineJudgeUrl-hint onlineJudgeUrl-error"
        />
        <p id="onlineJudgeUrl-hint" className="text-xs text-muted-foreground">
          문제 번호가 들어갈 자리에 <code>{"{id}"}</code>를 넣습니다. 비우면 차시의 &lsquo;온라인
          저지 문제&rsquo; 버튼이 &lsquo;준비 중&rsquo;으로 바뀝니다. 헤더의 온라인 저지 메뉴 주소는
          메뉴 관리에서 따로 정합니다.
        </p>
        <p id="onlineJudgeUrl-error" className="text-sm text-destructive empty:hidden">
          {errors.onlineJudgeUrl}
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-2 rounded-xl border bg-background p-4">
        <legend className="px-1 font-semibold">게시판</legend>
        <Label htmlFor="boardUploadLimit">회원 이미지 업로드 한도(하루)</Label>
        <Input
          id="boardUploadLimit"
          name="boardUploadLimit"
          type="number"
          inputMode="numeric"
          min={0}
          max={1000}
          step={1}
          required
          defaultValue={boardUploadLimit}
          aria-invalid={!!errors.boardUploadLimit || undefined}
          aria-describedby="boardUploadLimit-hint boardUploadLimit-error"
          className="w-32"
        />
        <p id="boardUploadLimit-hint" className="text-xs text-muted-foreground">
          회원 한 명이 최근 24시간 동안 게시판 글에 올릴 수 있는 이미지 수입니다. 0이면 회원
          업로드를 막습니다. 관리자는 제한이 없습니다.
        </p>
        <p id="boardUploadLimit-error" className="text-sm text-destructive empty:hidden">
          {errors.boardUploadLimit}
        </p>
      </fieldset>

      <p
        role="status"
        className={`text-sm empty:hidden ${state.ok ? "text-emerald-700" : "text-destructive"}`}
      >
        {state.message}
      </p>
      <Button type="submit" className="h-10 self-start" disabled={pending}>
        {pending ? "저장 중…" : "저장"}
      </Button>
    </form>
  );
}
