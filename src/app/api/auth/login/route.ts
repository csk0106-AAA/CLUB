import { NextResponse } from "next/server";
import { z } from "zod";
import { clearFails, createSession, lockedFor, recordFail } from "@/lib/auth";
import { loginCode } from "@/lib/login-code";
import { getStore } from "@/lib/store";

const body = z.object({ memberId: z.string().min(1), code: z.string().min(1).max(64) });

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "이름과 초대코드(연락처 뒷자리 4자리)를 입력해 주세요." }, { status: 400 });
  const { memberId, code } = parsed.data;

  const wait = lockedFor(memberId);
  if (wait > 0) {
    return NextResponse.json({ error: `잠시 후 다시 시도해 주세요. (${wait}초)` }, { status: 429 });
  }

  const s = await getStore();
  const member = (await s.list("Members")).find((m) => m.id === memberId);
  // 개인 초대코드 = 명단에 등록된 연락처 뒷자리 4자리. 연락처가 없는 회원만 공통 초대코드를 쓴다.
  const expected = member ? await loginCode(member) : "";
  // 사회자 접속번호: 이 회원이 사회자로 지정된 활동 중 번호가 맞는 것. 맞으면 활동 진행 화면만 쓰는 세션을 만든다.
  if (member && code.trim() !== expected) {
    const hosting = (await s.list("EventActivities")).filter((a) => a.hostId === member.id && a.hostCode && a.hostCode === code.trim());
    if (hosting.length > 0) {
      clearFails(memberId);
      await createSession({ mid: member.id, name: member.name, perms: [], admin: false, host: hosting.map((a) => a.id) });
      return NextResponse.json({ ok: true, name: member.name, host: true });
    }
  }
  if (!member || !expected || code.trim() !== expected) {
    recordFail(memberId);
    return NextResponse.json({ error: "초대코드가 맞지 않아요. 연락처 뒷자리 4자리를 확인해 주세요." }, { status: 401 });
  }

  clearFails(memberId);
  const perms = member.perms ? member.perms.split("|").filter(Boolean) : [];
  await createSession({ mid: member.id, name: member.name, perms, admin: false });
  return NextResponse.json({ ok: true, name: member.name, isAdmin: perms.length > 0 });
}
