import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { appHandlers, changeOption, isEdu, myApply } from "@/lib/member-apps";
import { pushTo } from "@/lib/push";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 내 회원 신청 상태(로그인 뒤 안내 팝업·설정의 "정회원 신청" 칸)
export async function GET() {
  const g = await guard();
  if ("err" in g) return g.err;
  const s = await getStore();
  const [members, apps] = await Promise.all([s.list("Members"), s.list("MemberApps")]);
  const me = members.find((m) => m.id === g.s.mid);
  if (!me) return bad("회원 정보를 찾을 수 없어요.", 404);
  return NextResponse.json(myApply(me, apps));
}

const body = z.union([
  // 설정에서 "정회원 신청"(대기회원). 교육 이수자면 승인 때 정회원, 아니면 준회원.
  z.object({ action: z.literal("apply"), message: z.string().trim().max(300).default("") }),
  // 안내에서 결과(승인·반려)를 봤음
  z.object({ action: z.literal("seen") }),
  // 설정 › 회원 권한 수정: 지금 구분에서 할 수 있는 변경(대기회원으로 변경 / 정회원 신청 / 준회원 신청)을 관리자에게 요청
  z.object({ action: z.literal("change"), to: z.string().trim().min(1).max(40) }),
]);

export async function POST(req: Request) {
  const g = await guard();
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("요청을 확인해 주세요. 남길 말은 300자까지 쓸 수 있어요.");
  const s = await getStore();
  const [members, apps] = await Promise.all([s.list("Members"), s.list("MemberApps")]);
  const me = members.find((m) => m.id === g.s.mid);
  if (!me) return bad("회원 정보를 찾을 수 없어요.", 404);

  if (parsed.data.action === "seen") {
    for (const a of apps.filter((x) => x.memberId === me.id && x.status !== "pending" && x.resultSeen !== "true")) {
      await s.update("MemberApps", a.id, { resultSeen: "true" });
    }
    return NextResponse.json({ ok: true });
  }

  const st = myApply(me, apps);
  if (st.app?.status === "pending") return bad("이미 신청했어요. 관리자가 확인할 때까지 기다려 주세요.", 409);

  if (parsed.data.action === "change") {
    const opt = changeOption(me.kind);
    if (!opt || opt.to !== parsed.data.to) return bad("지금 회원구분에서는 이 변경을 요청할 수 없어요. 화면을 새로 고쳐 주세요.", 409);
    await s.insert("MemberApps", {
      memberId: me.id, name: me.name, phone: me.phone ?? "", type: "change", edu: isEdu(me) ? "yes" : "no",
      recommenders: "", message: opt.label, source: "change", status: "pending", reason: "",
      createdAt: new Date().toISOString(), handledBy: "", handledAt: "", fromKind: me.kind ?? "", toKind: opt.to, resultSeen: "", note: "",
    });
    try {
      await pushTo(await appHandlers(members), "alerts", me.id);
    } catch (e) {
      console.error("[push] 구분 변경 요청 알림 실패", e);
    }
    return NextResponse.json(myApply(me, await s.list("MemberApps")));
  }
  if (!st.canApply) return bad("대기회원만 정회원 신청을 할 수 있어요.", 403);
  // 처음 신청할 때 받은 추천인은 다시 신청할 때도 이어서 보여 준다
  const prev = apps.filter((a) => a.memberId === me.id && a.recommenders).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))[0];
  await s.insert("MemberApps", {
    memberId: me.id, name: me.name, phone: me.phone ?? "", type: "member", edu: isEdu(me) ? "yes" : "no",
    recommenders: prev?.recommenders ?? "", message: parsed.data.message, source: "settings", status: "pending", reason: "",
    createdAt: new Date().toISOString(), handledBy: "", handledAt: "", fromKind: "", toKind: "", resultSeen: "",
  });
  try {
    await pushTo(await appHandlers(members), "alerts", me.id);
  } catch (e) {
    console.error("[push] 정회원 신청 알림 실패", e);
  }
  return NextResponse.json(myApply(me, await s.list("MemberApps")));
}
