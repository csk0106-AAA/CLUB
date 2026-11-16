import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { creatableTypes } from "@/lib/perm-keys";
import { audienceInput, inClubOrObserver } from "@/lib/audience";
import { readClubInfo } from "@/lib/clubs";
import { clubPayAccount, duesAccount, readDues } from "@/lib/dues";
import { getLists } from "@/lib/lists";
import { isLight } from "@/lib/event-types";
import { EVENT_TYPES } from "@/lib/schemas";
import { fixLegacyTypes } from "@/lib/event-migrate";
import { getStore } from "@/lib/store";
import { isGuest } from "@/lib/member-kind";

export const dynamic = "force-dynamic";

// 일정 목록(관리자). 일정관리 권한은 모든 일정, 소모임관리 권한만 있으면 소모임 일정만.
export async function GET() {
  const g = await guard(["events", "clubs"]);
  if ("err" in g) return g.err;
  const onlyClubs = !g.s.perms.includes("all") && !g.s.perms.includes("events");
  const s = await getStore();
  const [allEvents, applies, members] = await Promise.all([s.list("Events"), s.list("EventApplies"), s.list("Members")]);
  const events = onlyClubs ? allEvents.filter((e) => (e.club ?? "").trim()) : allEvents;
  // 참석 신청 진행 막대의 분모: 대기회원·참관회원을 뺀 회원 수(일정 상세의 신청 명단과 같은 기준)
  // 소모임 일정은 그 소모임 회원 + 참관자만 센다.
  await fixLegacyTypes(events);
  const active = members.filter((m) => !isGuest(m.kind));
  const list = events.map((e) => {
    const target = e.club ? active.filter((m) => inClubOrObserver(e, m)) : active;
    const ids = new Set(target.map((m) => m.id));
    const a = applies.filter((x) => x.eventId === e.id && ids.has(x.memberId));
    return {
      ...e,
      total: target.length,
      attend: a.filter((x) => x.answer === "참석").length,
      absent: a.filter((x) => x.answer === "불참").length,
      paid: a.filter((x) => x.answer === "참석" && x.paid === "true").length,
    };
  });
  const lists = await getLists();
  return NextResponse.json({ events: list, clubs: lists.clubs });
}

const body = z.object({
  type: z.enum(EVENT_TYPES),
  name: z.string().trim().min(1).max(80),
  club: z.string().trim().max(40).optional(), // 소모임 일정이면 소모임 이름
  pinned: z.boolean().optional(), // 회원 일정 목록 맨 위에 고정
  // 일정 페이지의 "+ 일정 만들기"에서 함께 정하는 값(모두 선택). 일시는 한국 시간 "YYYY-MM-DDTHH:mm".
  startsAt: z.string().regex(/^(\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?)?$/).optional(),
  endsAt: z.string().regex(/^(\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?)?$/).optional(),
  place: z.string().trim().max(120).optional(),
  audience: audienceInput.optional(), // 공개 대상(소모임이 아닌 일정, 비우면 전체 회원)
});

// 일정 만들기: 일정관리(모든 종류) 또는 일정 만들기 권한(evMain: 정기모임·워크숍·회의·미팅 / evClub: 소모임·회의·미팅)
export async function POST(req: Request) {
  const g = await guard(["events", "evMain", "evClub", "clubs"]);
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("일정 유형과 이름을 입력해 주세요. 일시는 달력에서 골라 주세요.");
  const { type, name, startsAt = "", endsAt = "", place = "" } = parsed.data;
  const allowed = creatableTypes(g.s.perms);
  if (allowed && !allowed.includes(type)) return bad(`${type} 일정을 만들 권한이 없어요. 만들 수 있는 일정: ${allowed.join(", ")}`, 403);
  if (startsAt && endsAt && endsAt < startsAt) return bad("끝나는 일시가 시작 일시보다 빨라요.");
  const club = type === "소모임" ? parsed.data.club ?? "" : "";
  // 소모임 일정은 소모임이 꼭 있어야 한다(없으면 그 소모임의 일정관리에 안 보이고, 누구나 참석 신청할 수 있게 된다)
  if (type === "소모임" && !club) return bad("어느 소모임 일정인지 골라 주세요.");
  if (club && !(await getLists()).clubs.includes(club)) return bad("소모임을 목록에서 골라 주세요.");
  const s = await getStore();
  let audience = "";
  const a = parsed.data.audience;
  if (!club && a && a.mode !== "all") {
    const ids = new Set((await s.list("Members")).map((m) => m.id));
    const memberIds = [...new Set(a.memberIds)].filter((id) => ids.has(id));
    if (memberIds.length === 0) return bad("공개할 회원을 한 명 이상 골라 주세요.");
    audience = JSON.stringify({ ...a, memberIds });
  }
  // 입금계좌 미리 채우기: 소모임 일정은 그 소모임 계좌, 그 밖에는 모임회비관리 계좌. 개요에서 고칠 수 있다.
  // 회의·미팅은 회비가 없어 비워 둔다.
  let account = "", accountHolder = "";
  if (club) {
    const p = await clubPayAccount(club, await readClubInfo(club));
    account = p.account;
    accountHolder = p.holder;
  } else if (!isLight(type)) {
    const d = await readDues();
    account = duesAccount(d);
    accountHolder = d.holder;
  }
  // 새 일정은 초안이고 회원에게 공개되지 않는다. 개요를 채운 뒤 '공개 및 회원전달'로 공개한다(상태: 초안 → 공개).
  const ev = await s.insert("Events", {
    type, name, club, account, accountHolder, startsAt, endsAt, place, audience,
    status: "초안", published: "false", pinned: String(parsed.data.pinned === true),
    // 만든 사람: 일정 만들기 권한자는 자기가 만든 일정만 고칠 수 있다(lib/api.ts guardEv)
    createdBy: g.s.mid,
  });
  return NextResponse.json({ event: ev });
}
