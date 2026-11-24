import { NextResponse } from "next/server";
import { z } from "zod";
import { guessStatus, windowBase } from "@/lib/activities";
import { bad, guard } from "@/lib/api";
import { getStore } from "@/lib/store";
import { isGuest } from "@/lib/member-kind";
import { NOT_ACTION, NOT_ATTENDEE, canAct, canJoin, joinSet } from "@/lib/participants";
import { guessClosed, loadWho, type WhoCtx } from "@/lib/who";
import { guessActionKey, onsiteGuessKey } from "@/lib/template-schema";
import { liveRow, rounds } from "@/lib/rounds";
import { memberScope } from "@/lib/team-run";
import type { PreStatus } from "@/lib/activities";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ aid: string }> };

const tripText = (days: string): string => {
  // 화면 표시용: "2026/12/11" 또는 "2026/12/11부터 2026/12/12까지"
  const ds = days.split(",").map((d) => d.trim().slice(0, 10)).filter(Boolean).sort().map((d) => d.replace(/-/g, "/"));
  if (ds.length === 0) return "";
  return ds.length === 1 ? ds[0] : `${ds[0]}부터 ${ds[ds.length - 1]}까지`;
};

// 현장 맞히기 흐름(템플릿에 “사람 고르기” 현장 단계가 있는 활동): 진행자가 소개를 하나 열면 그 소개만 고를 수 있고,
//  마감하면 닫힌다. 고르는 화면은 일정의 활동 진행 칸(회원 휴대폰)이고, 이 목록(누구일까요? 탭)은 안내만 한다.
//  조별 진행이면 후보는 같은 조원만.
type Onsite = { status: PreStatus; target: string; inScope: (m: string) => boolean };
async function onsiteOf(w: WhoCtx, memberId: string): Promise<Onsite | null> {
  const key = onsiteGuessKey(w.cfg);
  if (!key) return null;
  const sc = await memberScope(w.act, memberId);
  const [live, list] = await Promise.all([liveRow(w.act.id, sc.teamId), rounds(w.act.id, sc.teamId)]);
  const cur = list.find((r) => r.state === "guess");
  const open = !!cur && live?.step === key && live.memberUnlocked === "true";
  const status: PreStatus["status"] = open ? "open" : list.length > 0 ? "closed" : "before";
  return { status: { enabled: true, status, opensAt: "", closesAt: "" }, target: open ? cur!.targetMemberId : "", inScope: sc.inScope };
}

// 사전 추측 목록: 승인된 소개만, 별칭으로만 보여 준다. 본인 글은 제외한다.
// 응답의 profileId 는 프로필 번호일 뿐이라 누구의 글인지는 알 수 없다.
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;
  const on = await onsiteOf(w, g.s.mid);
  const gs = on ? on.status : guessStatus(w.cfg, windowBase(w.act, w.ev));
  // 현장 맞히기는 진행 칸에서 고른다(여기는 안내만)
  if (on || gs.status === "before" || gs.status === "none" || gs.status === "unknown") {
    return NextResponse.json({ guess: gs, onsite: !!on, targets: [], candidates: [] });
  }
  const inScope = (_m: string) => true;

  // 이 활동의 참석자만 맞히기에 참여하고, 참석자의 소개만 노출된다. 불참하는 분의 소개는 프로필 북에만 실린다.
  const join = await joinSet(w.cfg, w.act, w.ev);
  if (!(await canAct(w.cfg, w.act, w.ev, g.s.mid, guessActionKey(w.cfg)))) {
    // 참여자이지만 선택참여라 맞히기가 선별 조건에 없으면 notAllowed(회원 화면에 기다림 안내), 참여자가 아니면 notJoin
    const joined = await canJoin(w.cfg, w.act, w.ev, g.s.mid);
    return NextResponse.json({ guess: gs, onsite: !!on, targets: [], candidates: [], notJoin: !joined, notAllowed: joined });
  }

  const s = await getStore();
  const [profiles, guesses, members, applies] = await Promise.all([
    s.list("Profiles"), s.list("Guesses"), s.list("Members"), s.list("EventApplies"),
  ]);
  const mine = guesses.filter((x) => x.eventActivityId === aid && x.guesserId === g.s.mid);

  const targets = profiles
    .filter((p) => p.introStatus === "approved" && p.memberId !== g.s.mid && (!join || join.has(p.memberId)) && inScope(p.memberId))
    .map((p) => ({
      profileId: p.id,
      alias: p.alias,
      introMd: p.introMd,
      myChoice: mine.find((x) => x.targetMemberId === p.memberId)?.chosenMemberId ?? "",
    }))
    .sort((a, b) => a.alias.localeCompare(b.alias, "ko"));

  // 후보: 회원 명단. 워크숍(여러 날 일정) 참석자에게는 라벨과 날짜를 붙인다.
  const isTrip = w.ev.type === "워크숍";
  const candidates = members
    .filter((m) => !isGuest(m.kind) && m.id !== g.s.mid && (!join || join.has(m.id)) && inScope(m.id))
    .map((m) => {
      const a = applies.find((x) => x.eventId === w.ev.id && x.memberId === m.id && x.answer === "참석");
      return { id: m.id, name: m.name, trip: isTrip && a ? `일정 참석자 · ${tripText(a.days)}`.replace(/ · $/, "") : "" };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return NextResponse.json({ guess: gs, targets, candidates });
}

const body = z.object({ profileId: z.string().min(1), chosenMemberId: z.string().min(1) });

// 한 번의 클릭으로 추측. 마감 전까지 바꿀 수 있다.
export async function POST(req: Request, ctx: Ctx) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;
  const on = await onsiteOf(w, g.s.mid);
  if (on) {
    if (on.status.status !== "open") return bad("지금은 고를 수 없어요. 진행자가 소개를 열면 고를 수 있어요.", 409);
  } else {
    const closed = guessClosed(w);
    if (closed) return closed;
  }
  const inScope = (m: string) => !on || on.inScope(m);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요.");

  const join = await joinSet(w.cfg, w.act, w.ev);
  if (!(await canJoin(w.cfg, w.act, w.ev, g.s.mid))) return bad(NOT_ATTENDEE, 403);
  if (!(await canAct(w.cfg, w.act, w.ev, g.s.mid, guessActionKey(w.cfg)))) return bad(NOT_ACTION, 403);

  const s = await getStore();
  const target = (await s.list("Profiles")).find((p) => p.id === parsed.data.profileId && p.introStatus === "approved" && (!join || join.has(p.memberId)) && inScope(p.memberId));
  if (!target) return bad("소개글을 찾을 수 없어요.", 404);
  if (on && target.memberId !== on.target) return bad("지금 열린 소개만 고를 수 있어요.", 409);
  if (target.memberId === g.s.mid) return bad("내 글에는 추측할 수 없어요.");
  const chosen = (await s.list("Members")).find((m) => m.id === parsed.data.chosenMemberId && !isGuest(m.kind));
  if (!chosen || (join && !join.has(chosen.id))) return bad("명단에 없는 회원이에요.");
  if (!inScope(chosen.id)) return bad("같은 조원 중에서 골라 주세요.");
  if (chosen.id === g.s.mid) return bad("나 자신은 고를 수 없어요.");

  const cur = (await s.list("Guesses")).find(
    (x) => x.eventActivityId === aid && x.guesserId === g.s.mid && x.targetMemberId === target.memberId,
  );
  if (cur) await s.update("Guesses", cur.id, { chosenMemberId: chosen.id, createdAt: new Date().toISOString() });
  else await s.insert("Guesses", { eventActivityId: aid, guesserId: g.s.mid, targetMemberId: target.memberId, chosenMemberId: chosen.id, createdAt: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
