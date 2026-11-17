import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { DIRS, DIR_LABEL, carpoolState, cars } from "@/lib/carpool";
import { roomState, rooms } from "@/lib/rooms";
import { gTeams } from "@/lib/groups";
import { eventVisible } from "@/lib/audience";
import { readDayPlaces } from "@/lib/day-places";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 회원이 보는 일정 정보: 일정, 내 조편성(배포된 것만), 내 카풀(배포된 것만).
// 준비 목록과 비용은 관리자만 본다.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const s = await getStore();
  const [events, sched, groups, members, state, all] = await Promise.all([
    s.list("Events"), s.list("EventSchedule"), s.list("Groupings"), s.list("Members"), carpoolState(id), cars(id),
  ]);
  const me = members.find((m) => m.id === g.s.mid);
  const ev = events.find((e) => e.id === id && eventVisible(e, me ?? g.s.mid));
  if (!ev) return bad("일정을 찾을 수 없어요.", 404);
  const nm = (mid: string) => members.find((m) => m.id === mid)?.name ?? "";

  // 배포된 조편성: 내 조와 전체 조 구성(조에 없는 사람도 전체를 볼 수 있게). 배포 전 조편성은 개수만 알려 준다.
  const evGroups = groups.filter((x) => x.eventId === id);
  const myGroups = evGroups
    .filter((x) => x.published === "true")
    .map((x) => {
      const teams = gTeams(x);
      const t = teams.find((y) => y.memberIds.includes(g.s.mid));
      return {
        title: x.title, team: t?.name ?? "", members: t ? t.memberIds.map(nm) : [],
        teams: teams.map((y) => ({ name: y.name, members: y.memberIds.map(nm), mine: y.memberIds.includes(g.s.mid) })),
      };
    });
  const groupsPending = evGroups.filter((x) => x.published !== "true").length;

  // 구간별(갈 때 → 올 때)로 내가 운전하거나 타는 차량
  const myCars = state.published
    ? DIRS.flatMap((d) =>
        all
          .filter((c) => c[d].on && (c.driverId === g.s.mid || c[d].riders.includes(g.s.mid)))
          .map((c) => ({
            dir: d, leg: DIR_LABEL[d], name: c.name, plate: c.plate, from: c[d].from, to: c[d].to, departAt: c[d].departAt, arriveAt: c[d].arriveAt,
            driver: nm(c.driverId), iDrive: !!c.driverId && c.driverId === g.s.mid, riders: c[d].riders.filter((x) => x !== g.s.mid).map(nm), seats: c.seats,
          })),
      )
    : [];

  const [roomSt, allRooms] = await Promise.all([roomState(id), rooms(id)]);
  const myRooms = roomSt.published
    ? allRooms
        .filter((r) => r.guests.includes(g.s.mid))
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((r) => ({ date: r.date, name: r.name, memo: r.memo, mates: r.guests.filter((x) => x !== g.s.mid).map(nm) }))
    : [];

  return NextResponse.json({
    rooms: { published: roomSt.published, mine: myRooms },
    schedule: sched.filter((r) => r.eventId === id).sort((a, b) => a.at.localeCompare(b.at)).map((r) => ({ at: r.at, title: r.title, place: r.place ?? "", memo: r.memo ?? "" })),
    dayPlaces: readDayPlaces(ev.dayPlaces), // 세부일정 날짜별 기본 위치
    groups: myGroups,
    groupsPending,
    carpool: { published: state.published, mine: myCars },
  });
}
