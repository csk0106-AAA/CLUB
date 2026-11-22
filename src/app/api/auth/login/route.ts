import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession } from "@/lib/auth";
import { failClear, failRecord, failWait, pinActive, pinsOf, verifyPin, waitText } from "@/lib/pin";
import { tellMember, tellMemberAdmins } from "@/lib/pin-alerts";
import { loginCode } from "@/lib/login-code";
import { isWithdrawn } from "@/lib/member-kind";
import { hostCodeMatches } from "@/lib/hosts";
import { effectivePerms, getPermGroups } from "@/lib/perms";
import { getStore } from "@/lib/store";

const body = z.object({ memberId: z.string().min(1), code: z.string().min(1).max(64) });

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "이름과 PIN(처음이면 연락처 뒷자리 4자리)을 입력해 주세요." }, { status: 400 });
  const { memberId, code } = parsed.data;

  const wait = await failWait(memberId);
  if (wait > 0) return NextResponse.json({ error: waitText(wait) }, { status: 429 });

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

// 실패 기록: 5번 틀리면 15분 잠금 — 잠기면 본인과 회원관리 관리자에게 알림
async function failed(member: { id?: string; name?: string } | undefined, memberId: string, msg: string) {
  if (await failRecord(memberId)) {
    if (member) {
      await tellMember(member.id ?? memberId, "로그인에 여러 번 실패해서 15분 동안 잠겼어요. 본인이 아니라면 관리자에게 알려 주세요.").catch(() => undefined);
      await tellMemberAdmins(`${member.name} 님 계정이 로그인 실패로 15분 동안 잠겼어요.`).catch(() => undefined);
    }
    return NextResponse.json({ error: waitText(15 * 60) }, { status: 429 });
  }
  return NextResponse.json({ error: msg }, { status: 401 });
}

async function login(memberId: string, code: string) {
  const s = await getStore();
  const member = (await s.list("Members")).find((m) => m.id === memberId);
  if (!member) return failed(undefined, memberId, "PIN 이 맞지 않아요.");
  const c = code.trim();
  const pins = await pinsOf(member.id);
  // 진행자 접속번호: 이 회원이 진행자로 지정된 활동 중 번호가 맞는 것. 맞으면 활동 진행 화면만 쓰는 세션을 만든다.
  const hostLogin = async () => {
    const hosting = (await s.list("EventActivities")).filter((a) => hostCodeMatches(a, member.id, c));
    if (!hosting.length) return null;
    await failClear(memberId);
    await createSession({ mid: member.id, name: member.name, perms: [], admin: false, host: hosting.map((a) => a.id) });
    return NextResponse.json({ ok: true, name: member.name, host: true });
  };

  if (!pinActive()) {
    // PIN 적용 전(2026-12-12 전): 예전 방식 — 개인 초대코드(연락처 뒷자리 4자리)로 바로 로그인
    const expected = await loginCode(member);
    if (!expected || c !== expected) return (await hostLogin()) ?? failed(member, memberId, "초대코드가 맞지 않아요. 연락처 뒷자리 4자리를 확인해 주세요.");
  } else if (pins.member) {
    // PIN 을 만든 회원: PIN 으로만 로그인(연락처 4자리는 더 쓰지 않는다)
    if (!verifyPin(c, pins.member)) return (await hostLogin()) ?? failed(member, memberId, "PIN 이 맞지 않아요. PIN 을 잊었다면 아래 “PIN을 잊었어요”를 눌러 주세요.");
  } else {
    // 아직 PIN 이 없는 회원: 개인 초대코드(연락처 뒷자리 4자리, 없으면 공통 초대코드)를 확인하고 PIN 을 만들게 한다(세션은 PIN 을 만든 뒤)
    const expected = await loginCode(member);
    if (!expected || c !== expected) return (await hostLogin()) ?? failed(member, memberId, "초대코드가 맞지 않아요. 처음 로그인이면 연락처 뒷자리 4자리를 넣어 주세요.");
    if (isWithdrawn(member.kind)) return withdrawnRes();
    await failClear(memberId);
    return NextResponse.json({ needPin: true, name: member.name });
  }

  await failClear(memberId);
  // 탈퇴한 회원은 로그인할 수 없다(재가입 신청 → 관리자가 승인하거나 회원 수정에서 탈퇴 해지)
  if (isWithdrawn(member.kind)) return withdrawnRes();
  // 최종 권한 = 직책·클럽 직책 그룹 권한 ∪ 개인 권한 (lib/perms.ts)
  const perms = effectivePerms(member, await getPermGroups());
  await createSession({ mid: member.id, name: member.name, perms, admin: false });
  return NextResponse.json({ ok: true, name: member.name, isAdmin: perms.length > 0 });
}

function withdrawnRes() {
  return NextResponse.json({ error: "탈퇴한 회원이에요. 다시 활동하려면 로그인 화면 아래 ‘회원 또는 참관 신청’으로 재가입을 신청해 주세요. 관리자가 확인하면 다시 로그인할 수 있어요.", withdrawn: true }, { status: 403 });
}
