import { NextResponse } from "next/server";
import { z } from "zod";
import { clearFails, createSession, lockedFor, recordFail } from "@/lib/auth";
import { loginCode } from "@/lib/login-code";
import { effectivePerms, getPermGroups } from "@/lib/perms";
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

  // 서버 쪽 문제(설정 값 빠짐·DB 연결 실패)는 오류 화면 대신 원인을 알려 주는 JSON 으로 돌려준다(로그에도 남긴다).
  try {
    return await login(memberId, code);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[login] 실패", msg);
    if (msg.includes("SESSION_SECRET")) {
      return NextResponse.json({ error: "서버 설정(SESSION_SECRET)이 빠져 있어서 로그인할 수 없어요. 관리자에게 알려 주세요." }, { status: 500 });
    }
    return NextResponse.json({ error: "서버에서 회원 정보를 읽지 못했어요(DB 연결). 잠시 후 다시 시도하고, 계속되면 관리자에게 알려 주세요." }, { status: 500 });
  }
}

async function login(memberId: string, code: string) {
  const s = await getStore();
  const member = (await s.list("Members")).find((m) => m.id === memberId);
  // 개인 초대코드 = 명단에 등록된 연락처 뒷자리 4자리. 연락처가 없는 회원만 공통 초대코드를 쓴다.
  const expected = member ? await loginCode(member) : "";
  // 진행자 접속번호: 이 회원이 진행자로 지정된 활동 중 번호가 맞는 것. 맞으면 활동 진행 화면만 쓰는 세션을 만든다.
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
  // 최종 권한 = 직책·소모임 직책 그룹 권한 ∪ 개인 권한 (lib/perms.ts)
  const perms = effectivePerms(member, await getPermGroups());
  await createSession({ mid: member.id, name: member.name, perms, admin: false });
  return NextResponse.json({ ok: true, name: member.name, isAdmin: perms.length > 0 });
}
