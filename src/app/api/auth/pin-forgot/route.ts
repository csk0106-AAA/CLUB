import { NextResponse } from "next/server";
import { z } from "zod";
import { tellMemberAdmins } from "@/lib/pin-alerts";
import { getSetting, getStore, setSetting } from "@/lib/store";

const body = z.object({ memberId: z.string().min(1) });

// PIN 을 잊었어요: 회원관리 관리자에게 초기화 요청 알림(같은 회원은 10분에 한 번만)
export async function POST(req: Request) {
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "이름을 먼저 골라 주세요." }, { status: 400 });
  const member = (await (await getStore()).list("Members")).find((m) => m.id === p.data.memberId);
  if (!member) return NextResponse.json({ error: "이름을 먼저 골라 주세요." }, { status: 404 });
  const key = `pinForgot:${member.id}`;
  const last = await getSetting<number>(key, 0);
  if (Date.now() - last > 10 * 60_000) {
    await setSetting(key, Date.now());
    await tellMemberAdmins(`${member.name} 님이 로그인 PIN 초기화를 요청했어요. 회원명단에서 그 회원의 “PIN 초기화”를 눌러 주세요.`, member.id);
  }
  return NextResponse.json({ ok: true });
}
