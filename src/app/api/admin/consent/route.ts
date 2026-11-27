import { NextResponse } from "next/server";
import { bad, guard, parseJson } from "@/lib/api";
import { CONSENT_SINCE, consentOk, consentSince } from "@/lib/consent";
import { isGuest } from "@/lib/member-kind";
import { getStore, setSetting } from "@/lib/store";

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

// 모두 다시 동의 받기: 지금 시각을 기준으로 정한다. 그 전에 한 동의는 기록으로 남고, 다음 접속 때 동의 안내가 다시 뜬다.
export async function POST(req: Request) {
  const g = await guard(["members"]);
  if ("err" in g) return g.err;
  const b = (await req.json().catch(() => null)) as { action?: string } | null;
  if (b?.action !== "reset") return bad("요청을 확인해 주세요.");
  const now = new Date().toISOString();
  await setSetting(CONSENT_SINCE, now);
  return NextResponse.json({ ok: true, since: now });
}
