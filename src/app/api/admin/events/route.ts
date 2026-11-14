import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { inClubOrObserver } from "@/lib/audience";
import { clubAccount, readClubInfo } from "@/lib/clubs";
import { duesAccount, readDues } from "@/lib/dues";
import { getLists } from "@/lib/lists";
import { EVENT_TYPES } from "@/lib/schemas";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guard(["events", "fees"]);
  if ("err" in g) return g.err;
  const s = await getStore();
  const [events, applies, members] = await Promise.all([s.list("Events"), s.list("EventApplies"), s.list("Members")]);
  // 참석 신청 진행 막대의 분모: 회원대기를 뺀 회원 수(행사 상세의 신청 명단과 같은 기준)
  // 소모임 행사는 그 소모임 회원 + 참관자만 센다.
  const active = members.filter((m) => m.kind !== "회원대기");
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
  club: z.string().trim().max(40).optional(), // 소모임 행사면 소모임 이름
  pinned: z.boolean().optional(), // 회원 행사 목록 맨 위에 고정
});

export async function POST(req: Request) {
  const g = await guard("events");
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("행사 유형과 이름을 입력해 주세요.");
  const { type, name } = parsed.data;
  const club = type === "소모임" ? parsed.data.club ?? "" : "";
  if (club && !(await getLists()).clubs.includes(club)) return bad("소모임을 목록에서 골라 주세요.");
  // 입금계좌 미리 채우기: 소모임 행사는 그 소모임 계좌, 그 밖에는 모임회비관리 계좌. 개요에서 고칠 수 있다.
  let account = "", accountHolder = "";
  if (club) {
    const i = await readClubInfo(club);
    account = clubAccount(i);
    accountHolder = i.holder;
  } else {
    const d = await readDues();
    account = duesAccount(d);
    accountHolder = d.holder;
  }
  const s = await getStore();
  // 새 행사는 초안이고 회원에게 공개되지 않는다. 개요를 채운 뒤 '회원에게 전달'로 공개한다.
  const ev = await s.insert("Events", { type, name, club, account, accountHolder, status: "초안", published: "false", pinned: String(parsed.data.pinned === true) });
  return NextResponse.json({ event: ev });
}
