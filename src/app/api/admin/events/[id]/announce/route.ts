import { NextResponse } from "next/server";
import { bad, guardEv } from "@/lib/api";
import { teams, teamsState } from "@/lib/capsule";
import { DIRS, DIR_LABEL, carpoolState, cars, driverLabel } from "@/lib/carpool";
import { carRequests, visibleRiders } from "@/lib/car-requests";
import { roomState, rooms } from "@/lib/rooms";
import { gTeams } from "@/lib/groups";
import { readConfig, windowBase, windowStatus } from "@/lib/activities";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 대화방 공지 문구에 붙일 배정 내용(회원에게 배포된 것만): 조편성(팀 활동 포함) · 숙소 배정 · 차량 배정.
//  앱이 어려운 회원도 대화방 공지만 보고 알 수 있게, 명단을 글로 풀어서 돌려준다. 배포 전이면 그 칸은 빈 배열.
// "2026-12-11T09:00" → "12/11 09:00", "09:00" → "09:00"
function when(s: string): string {
  if (!s) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/.exec(s);
  if (!m) return s;
  return `${Number(m[2])}/${Number(m[3])}${m[4] ? ` ${m[4]}` : ""}`;
}
const day = (d: string) => when(d);

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guardEv(ctx, ["events", "templates"]);
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const s = await getStore();
  const [events, members, groupings, acts] = await Promise.all([s.list("Events"), s.list("Members"), s.list("Groupings"), s.list("EventActivities")]);
  if (!events.some((e) => e.id === id)) return bad("일정을 찾을 수 없어요.", 404);
  const nm = (mid: string) => members.find((m) => m.id === mid)?.name ?? "";
  const names = (ids: string[]) => ids.map(nm).filter(Boolean);

  // 조편성: 일정 조편성 + 팀 활동의 팀(배포된 것). 조 이름과 조원이 같은 구성은 한 번만(제목을 함께 적는다)
  type G = { title: string; act?: boolean; teams: { name: string; ids: string[]; leader: string }[] };
  const gs: G[] = groupings
    .filter((x) => x.eventId === id && x.published === "true")
    .map((x) => ({ title: x.title, teams: gTeams(x).map((t) => ({ name: t.name, ids: t.memberIds, leader: t.leaderId && t.memberIds.includes(t.leaderId) ? t.leaderId : "" })) }));
  for (const a of acts.filter((x) => x.eventId === id).sort((p, q) => Number(p.order || 0) - Number(q.order || 0))) {
    const ts = await teams(a.id);
    if (!ts.length || !(await teamsState(a.id)).published) continue;
    gs.push({ title: readConfig(a.config)?.name ?? "팀 활동", act: true, teams: ts.map((t) => ({ name: t.name, ids: t.memberIds, leader: "" })) });
  }
  // 활동 팀이 일정 조편성에서 활동에 참여하지 않는 사람만 뺀 것이면(조편성 가져오기) 같은 구성으로 본다(회원 화면과 같은 규칙)
  const sig = (x: G, only?: Set<string>) => JSON.stringify(
    x.teams.map((t) => [t.name, t.ids.filter((m) => !only || only.has(m)).sort()] as const).filter(([, ms]) => ms.length).sort((p, q) => p[0].localeCompare(q[0])),
  );
  const merged: (G & { titles: string[] })[] = [];
  for (const x of gs) {
    const inAct = new Set(x.teams.flatMap((t) => t.ids));
    const same = merged.find((m) => sig(m) === sig(x) || (x.act && !m.act && sig(m, inAct) === sig(x)));
    if (same) same.titles.push(x.title);
    else merged.push({ ...x, titles: [x.title] });
  }
  const groups = merged.map((x) => ({
    title: x.titles.join(" · "),
    // 조마다 두 줄: "🔹 1조 (5명)" / "    👑 조장 홍길동 · 김철수, 이영희"
    lines: x.teams.filter((t) => t.ids.length).flatMap((t) => {
      const rest = names(t.ids.filter((m) => m !== t.leader));
      return [`🔹 ${t.name} (${t.ids.length}명)`, `    ${t.leader ? `👑 조장 ${nm(t.leader)}${rest.length ? " · " : ""}` : ""}${rest.join(", ")}`];
    }),
  }));

  // 숙소 배정(배포된 것): 날짜 · 방 이름 · 사람
  const [roomSt, allRooms] = await Promise.all([roomState(id), rooms(id)]);
  //  날짜마다 "🗓 12/11" 아래에 방: "🔹 101호 (4명)" / "    이름, 이름" / "    📝 메모"
  const roomLines: string[] = [];
  if (roomSt.published) {
    let lastDate = "-";
    for (const r of allRooms.filter((x) => x.guests.length).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "ko"))) {
      if (r.date !== lastDate) { if (r.date) roomLines.push(`🗓 ${day(r.date)}`); lastDate = r.date; }
      roomLines.push(`🔹 ${r.name} (${r.guests.length}명)`, `    ${names(r.guests).join(", ")}`);
      if (r.memo) roomLines.push(`    📝 ${r.memo}`);
    }
  }

  // 차량 배정(배포된 것): 구간별(갈 때 → 올 때)로 차 · 운전 · 출발 · 탑승자(확정된 자리만)
  const [carSt, allCars, reqs] = await Promise.all([carpoolState(id), cars(id), carRequests(id)]);
  //  최종 배정 전에도 지금 배정(신청)된 기준으로 넣는다. 자리 대기 중인 사람은 "대기"로 따로.
  const carLines: string[] = [];
  const carsFinal = carSt.published && !!carSt.confirmDone;
  {
    for (const d of DIRS) {
      const list = allCars.filter((c) => c[d].on);
      if (!list.length) continue;
      // 구간 머리줄 다음에 차마다: 차 이름 · 운전 · 출발 · 도착 · 탑승 · 대기 · 메모를 한 줄씩
      carLines.push(d === "go" ? "➡️ 갈 때" : "⬅️ 올 때");
      for (const c of list) {
        const leg = c[d];
        const driver = driverLabel(c, nm);
        const riders = names((carsFinal ? visibleRiders(c, d, reqs) : c[d].riders).filter((m) => m !== c.driverId));
        const waiting = carsFinal ? [] : names(reqs.filter((r) => r.carId === c.id && r.dir === d && (r.status === "waiting" || r.status === "pending")).map((r) => r.memberId));
        carLines.push(`🔹 ${c.name}${c.plate ? ` (${c.plate})` : ""}`);
        if (driver) carLines.push(`    👤 운전: ${driver}`);
        if (leg.from) carLines.push(`    🕘 출발: ${leg.departAt ? `${when(leg.departAt)} ` : ""}${leg.from}`);
        if (leg.to) carLines.push(`    🏁 도착: ${leg.arriveAt ? `${when(leg.arriveAt)} ` : ""}${leg.to}`);
        carLines.push(`    🙋 탑승: ${riders.length ? riders.join(", ") : "없음"}`);
        if (waiting.length) carLines.push(`    ⏳ 대기: ${waiting.join(", ")}`);
        if (leg.memo) carLines.push(`    📝 ${leg.memo}`);
      }
    }
  }

  // 마감 일정: 회비 입금 기한 · 활동 사전 작성 기간 · 차량 모집/신청 기간(설정된 것만)
  const ev = events.find((e) => e.id === id)!;
  const deadlines: string[] = [];
  if (ev.feeDeadline) deadlines.push(`💰 회비 입금: ${when(ev.feeDeadline)}까지`);
  for (const a of acts.filter((x) => x.eventId === id).sort((p, q) => Number(p.order || 0) - Number(q.order || 0))) {
    const cfg = readConfig(a.config);
    if (!cfg) continue;
    const st = windowStatus(cfg.preEvent, windowBase(a, ev));
    if (st.enabled && st.closesAt) deadlines.push(`✏️ ${cfg.name} 사전 작성: ${st.opensAt ? `${when(st.opensAt.replace(" ", "T"))}부터 ` : ""}${when(st.closesAt.replace(" ", "T"))}까지`);
  }
  const range = (from?: string, until?: string) => `${from ? `${when(from)}부터 ` : ""}${until ? `${when(until)}까지` : ""}`.trim();
  if (carSt.recruitOn && carSt.recruitUntil) deadlines.push(`🚙 차량 모집(내 차 등록): ${range(carSt.recruitFrom, carSt.recruitUntil)}`);
  if ((carSt.open || carSt.recruitOn) && carSt.waitUntil) deadlines.push(`🚗 차량 신청: ${range(carSt.open ? carSt.openFrom : carSt.recruitUntil, carSt.waitUntil)}`);

  return NextResponse.json({ groups, rooms: roomLines, cars: carLines, carsFinal, deadlines });
}
