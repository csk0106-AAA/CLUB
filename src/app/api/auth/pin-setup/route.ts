import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession } from "@/lib/auth";
import { loginCode } from "@/lib/login-code";
import { isWithdrawn } from "@/lib/member-kind";
import { effectivePerms, getPermGroups } from "@/lib/perms";
import { failClear, failRecord, failWait, pinActive, pinProblem, pinsOf, savePin, waitText } from "@/lib/pin";
import { getStore } from "@/lib/store";

const body = z.object({ memberId: z.string().min(1), code: z.string().min(1).max(64), pin: z.string().max(20) });

// 처음 로그인: 개인 초대코드(연락처 뒷자리 4자리)를 다시 확인하고 6자리 PIN 을 만든다. 만든 뒤 바로 로그인된다.
export async function POST(req: Request) {
  if (!pinActive()) return NextResponse.json({ error: "로그인 PIN 은 아직 쓰지 않아요." }, { status: 409 });
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "PIN 을 확인해 주세요." }, { status: 400 });
  const { memberId, code, pin } = p.data;
  const wait = await failWait(memberId);
  if (wait > 0) return NextResponse.json({ error: waitText(wait) }, { status: 429 });
  const s = await getStore();
  const member = (await s.list("Members")).find((m) => m.id === memberId);
  if (!member || isWithdrawn(member.kind)) return NextResponse.json({ error: "회원 정보를 찾을 수 없어요." }, { status: 404 });
  if ((await pinsOf(member.id)).member) return NextResponse.json({ error: "이미 PIN 이 있어요. PIN 으로 로그인해 주세요." }, { status: 409 });
  const expected = await loginCode(member);
  if (!expected || code.trim() !== expected) {
    await failRecord(memberId);
    return NextResponse.json({ error: "초대코드가 맞지 않아요. 처음부터 다시 해 주세요." }, { status: 401 });
  }
  const why = pinProblem(pin, member.phone ?? "");
  if (why) return NextResponse.json({ error: why }, { status: 400 });
  const err = await savePin(member.id, "member", pin);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  await failClear(memberId);
  const perms = effectivePerms(member, await getPermGroups());
  await createSession({ mid: member.id, name: member.name, perms, admin: false });
  return NextResponse.json({ ok: true, name: member.name });
}
