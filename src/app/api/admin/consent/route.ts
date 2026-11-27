import { NextResponse } from "next/server";
import { guard, parseJson } from "@/lib/api";
import { consentOk, consentSince } from "@/lib/consent";
import { isGuest } from "@/lib/member-kind";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 개인정보 동의 현황: 지금 기준으로 동의한 회원 수(대기·참관·탈퇴회원 제외)
export async function GET() {
  const g = await guard(["members"]);
  if ("err" in g) return g.err;
  const since = await consentSince();
  const members = (await (await getStore()).list("Members")).filter((m) => !isGuest(m.kind));
  const agreed = members.filter((m) => consentOk(parseJson<{ consentAt?: string }>(m.extra, {}), since)).length;
  return NextResponse.json({ since, agreed, total: members.length });
}
