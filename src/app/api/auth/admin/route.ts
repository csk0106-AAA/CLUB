import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, getSession } from "@/lib/auth";
import { failClear, failRecord, failWait, pinActive, pinProblem, pinsOf, savePin, verifyPin, waitText } from "@/lib/pin";
import { tellMemberAdmins } from "@/lib/pin-alerts";
import { memberClubs } from "@/lib/lists";
import { getStore } from "@/lib/store";

// passcode: 관리자용 PIN(있으면) 또는 공용 관리자 비밀번호(처음·초기화 뒤). newPin: 공용 비밀번호와 함께 보내면 관리자용 PIN 을 만든다.
const body = z.object({ passcode: z.string().min(1).max(128), newPin: z.string().max(20).optional() });

// 관리자 2차 확인. 관리자 권한이 있거나 클럽 직책자(클럽관리·활동 템플릿용)만 통과할 수 있다.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.host) return NextResponse.json({ error: "관리자 권한이 없어요." }, { status: 403 });
  if (session.perms.length === 0) {
    const me = (await (await getStore()).list("Members")).find((m) => m.id === session.mid);
    if (!me || !memberClubs(me).some((c) => c.role)) {
      return NextResponse.json({ error: "관리자 권한이 없어요." }, { status: 403 });
    }
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "비밀번호를 입력해 주세요." }, { status: 400 });

  const key = `admin:${session.mid}`;
  const wait = await failWait(key);
  if (wait > 0) return NextResponse.json({ error: waitText(wait) }, { status: 429 });
  const shared = process.env.ADMIN_PASSCODE ?? "";
  const pins = await pinsOf(session.mid);
  const isShared = !!shared && parsed.data.passcode === shared;
  const allPerm = session.perms.includes("all");
  const fail = async (msg: string) => {
    if (await failRecord(key)) await tellMemberAdmins(`${session.name} 님 관리자 확인이 여러 번 실패해서 15분 동안 잠겼어요.`, session.mid).catch(() => undefined);
    return NextResponse.json({ error: msg }, { status: 401 });
  };

  // PIN 적용 전(2026-12-12 전): 예전 방식 — 공용 관리자 비밀번호만
  if (!pinActive()) {
    if (!isShared) return fail("관리자 비밀번호가 맞지 않아요.");
  // 관리자용 PIN 만들기: 공용 비밀번호를 다시 확인. 이미 PIN 이 있으면 모든 권한 관리자만(자기 PIN 을 잊었을 때)
  } else if (parsed.data.newPin !== undefined) {
    if (!isShared) return fail("관리자 공용 비밀번호가 맞지 않아요.");
    if (pins.admin && !allPerm) return NextResponse.json({ error: "이미 관리자용 PIN 이 있어요. 잊었다면 모든 권한 관리자에게 초기화를 요청해 주세요." }, { status: 409 });
    const me = await (await getStore()).get("Members", session.mid);
    const why = pinProblem(parsed.data.newPin, me?.phone ?? "");
    if (why) return NextResponse.json({ error: why }, { status: 400 });
    const err = await savePin(session.mid, "admin", parsed.data.newPin);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  } else if (pins.admin) {
    if (!verifyPin(parsed.data.passcode, pins.admin)) {
      // 모든 권한 관리자가 관리자용 PIN 을 잊었으면: 공용 비밀번호로 다시 만들 수 있다
      if (isShared && allPerm) return NextResponse.json({ needAdminPin: true, reset: true });
      return fail("관리자용 PIN 이 맞지 않아요.");
    }
  } else {
    // 관리자용 PIN 이 아직 없음: 공용 비밀번호를 확인하고 PIN 을 만들게 한다
    if (!isShared) return fail("관리자 공용 비밀번호가 맞지 않아요.");
    await failClear(key);
    return NextResponse.json({ needAdminPin: true });
  }
  await failClear(key);
  await createSession({ ...session, admin: true });
  return NextResponse.json({ ok: true });
}
