import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { eventVisible } from "@/lib/audience";
import { alreadyIn, handlersOf, pendingDup } from "@/lib/club-requests";
import { getLists } from "@/lib/lists";
import { pushTo } from "@/lib/push";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const body = z.object({
  kind: z.enum(["join", "observe"]),
  club: z.string().trim().max(40).optional(), // 가입 신청: 소모임 이름(행사에서 보내면 eventId 로 정해진다)
  eventId: z.string().max(64).optional(), // 참관 신청은 필수
  message: z.string().trim().max(300).default(""),
});

// 소모임 밖 회원이 보내는 소모임 가입 신청 / 행사 1회 참관 신청.
// 그 소모임 직책자에게 알림(앱 안 알림 + 휴대폰 알림, 내용 없이)이 간다.
export async function POST(req: Request) {
  const g = await guard();
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요. 메시지는 300자까지 쓸 수 있어요.");
  const { kind, message } = parsed.data;

  const s = await getStore();
  const [members, events, rows] = await Promise.all([s.list("Members"), s.list("Events"), s.list("ClubRequests")]);
  const me = members.find((m) => m.id === g.s.mid);
  if (!me || me.kind === "회원대기") return bad("회원대기 상태에서는 신청할 수 없어요.", 403);

  let club = parsed.data.club ?? "";
  let eventId = "";
  const ev = parsed.data.eventId ? events.find((e) => e.id === parsed.data.eventId) : undefined;
  if (parsed.data.eventId) {
    if (!ev || !eventVisible(ev, me) || !(ev.club ?? "").trim()) return bad("소모임 행사를 찾을 수 없어요.", 404);
    club = ev.club.trim();
    eventId = ev.id;
  }
  if (kind === "observe" && !eventId) return bad("참관할 행사를 골라 주세요.");
  if (!club || !(await getLists()).clubs.includes(club)) return bad("소모임을 찾을 수 없어요.", 404);
  if (alreadyIn(kind, me, club, ev)) {
    return bad(kind === "join" ? `이미 ${club} 회원이에요.` : "이미 이 행사의 참관자예요.", 409);
  }
  // 가입 신청은 행사와 상관없이 소모임당 하나만(참관 신청은 행사마다 하나)
  const dupEventId = kind === "join" ? "" : eventId;
  if (pendingDup(rows, kind, club, me.id, dupEventId)) {
    return bad(kind === "join" ? "이미 가입 신청을 보냈어요. 처리될 때까지 기다려 주세요." : "이미 참관 신청을 보냈어요. 처리될 때까지 기다려 주세요.", 409);
  }

  const row = await s.insert("ClubRequests", {
    kind, club, eventId, memberId: me.id, message, status: "pending",
    createdAt: new Date().toISOString(), handledBy: "", handledAt: "", resultSeen: "",
  });
  try {
    await pushTo(handlersOf(members, club), "alerts", me.id);
  } catch (e) {
    console.error("[push] 소모임 신청 알림 실패", e);
  }
  return NextResponse.json({ request: { id: row.id, kind, club, eventId, status: "pending" } });
}
