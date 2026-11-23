import { NextResponse } from "next/server";
import { isClubPaused } from "@/lib/club-status";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { eventVisible } from "@/lib/audience";
import { alreadyIn, handlersOf, pendingAttend, pendingDup } from "@/lib/club-requests";
import { clubLabel } from "@/lib/club-label";
import { getLists } from "@/lib/lists";
import { pushTo } from "@/lib/push";
import { getPermGroups } from "@/lib/perms";
import { isGuest } from "@/lib/member-kind";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const body = z.object({
  kind: z.enum(["join", "observe"]),
  club: z.string().trim().max(40).optional(), // 가입 신청: 클럽 이름(일정에서 보내면 eventId 로 정해진다)
  eventId: z.string().max(64).optional(), // 참관 신청·참석 요청은 필수
  message: z.string().trim().max(300).default(""),
  // true: 클럽 일정 화면의 "클럽 관리자에게 요청하기" — 승인되면 그 일정에 참석 신청까지 된다.
  attend: z.boolean().optional(),
});

// 클럽 밖 회원이 보내는 클럽 가입 신청 / 일정 1회 참관 신청 / 일정 참석 요청(참관·가입 + 참석).
// 그 클럽 직책자에게 알림(앱 안 알림 + 휴대폰 알림, 내용 없이)이 간다.
export async function POST(req: Request) {
  const g = await guard();
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요. 메시지는 300자까지 쓸 수 있어요.");
  const { kind, message } = parsed.data;
  const attend = parsed.data.attend === true;

  const s = await getStore();
  const [members, events, rows] = await Promise.all([s.list("Members"), s.list("Events"), s.list("ClubRequests")]);
  const me = members.find((m) => m.id === g.s.mid);
  if (!me) return bad("회원 정보를 찾을 수 없어요.", 404);
  // 대기회원·참관회원은 일정 참관 신청만 할 수 있다(어느 일정이든. 일반 일정은 일정 관리자가 승인).
  const guest = isGuest(me.kind);
  if (guest && kind === "join") return bad("정회원·준회원이 되면 클럽에 가입할 수 있어요. 일정은 참관 신청으로 함께해 주세요.", 403);

  let club = parsed.data.club ?? "";
  let eventId = "";
  const ev = parsed.data.eventId ? events.find((e) => e.id === parsed.data.eventId) : undefined;
  if (parsed.data.eventId) {
    if (!ev || !eventVisible(ev, me) || (!guest && !(ev.club ?? "").trim())) return bad("클럽 일정을 찾을 수 없어요.", 404);
    club = (ev.club ?? "").trim();
    eventId = ev.id;
  }
  if ((kind === "observe" || attend) && !eventId) return bad("참석할 일정을 골라 주세요.");
  if (club ? !(await getLists()).clubs.includes(club) : !(guest && eventId)) return bad("클럽을 찾을 수 없어요.", 404);
  if (club && (await isClubPaused(club))) return bad(`${club} 클럽은 활동을 멈춰서 신청을 받지 않아요.`, 409);
  if (attend ? alreadyIn("observe", me, club, ev) : alreadyIn(kind, me, club, ev)) {
    if (attend || guest) return bad("이미 이 일정에 참석 신청할 수 있어요. 화면을 새로 고쳐 주세요.", 409);
    return bad(kind === "join" ? `이미 ${clubLabel(club)} 회원이에요.` : "이미 이 일정의 참관자예요.", 409);
  }
  if (attend) {
    // 참석 요청은 일정마다 하나만(참관이든 가입이든)
    if (pendingAttend(rows, me.id, eventId)) return bad("이미 이 일정에 요청을 보냈어요. 관리자가 확인할 때까지 기다려 주세요.", 409);
  } else {
    // 가입 신청은 일정과 상관없이 클럽당 하나만(참관 신청은 일정마다 하나)
    const dupEventId = kind === "join" ? "" : eventId;
    if (pendingDup(rows, kind, club, me.id, dupEventId)) {
      return bad(kind === "join" ? "이미 가입 신청을 보냈어요. 처리될 때까지 기다려 주세요." : "이미 참관 신청을 보냈어요. 처리될 때까지 기다려 주세요.", 409);
    }
  }

  const row = await s.insert("ClubRequests", {
    kind, club, eventId, memberId: me.id, message, status: "pending",
    createdAt: new Date().toISOString(), handledBy: "", handledAt: "", resultSeen: "", attend: attend ? "true" : "",
  });
  try {
    await pushTo(handlersOf(members, club, await getPermGroups()), "requests", me.id);
  } catch (e) {
    console.error("[push] 클럽 신청 알림 실패", e);
  }
  return NextResponse.json({ request: { id: row.id, kind, club, eventId, status: "pending", attend } });
}
