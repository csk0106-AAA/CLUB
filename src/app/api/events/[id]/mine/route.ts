import { NextResponse } from "next/server";
import { lockedFor } from "@/lib/event-visibility";
import { bad, guard, parseJson } from "@/lib/api";
import { teams, teamsState } from "@/lib/capsule";
import { DIRS, DIR_LABEL, carpoolState, cars, driverLabel, legSeats } from "@/lib/carpool";
import { carRequests, visibleRiders } from "@/lib/car-requests";
import { roomState, rooms } from "@/lib/rooms";
import { gTeams } from "@/lib/groups";
import { eventVisible } from "@/lib/audience";
import { readDayPlaces } from "@/lib/day-places";
import { getStore } from "@/lib/store";
import { canPreviewEvent } from "@/lib/event-preview";

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
  const found = events.find((e) => e.id === id);
  // 관리하는 사람의 미리보기는 공개전 일정만(공개 대상 밖 일정은 열 수 없다)
  const visible = !!found && eventVisible(found, me ?? g.s.mid);
  const preview = !!found && !visible && found.published !== "true" && (await canPreviewEvent(found, me, g.s.mid));
  const ev = visible || preview ? found : undefined;
  if (!ev) return bad("일정을 찾을 수 없어요.", 404);
  const nm = (mid: string) => members.find((m) => m.id === mid)?.name ?? "";
  // 같은 조·차·방 명단: 나도 넣고 "(나)"로 표시
  const nmMe = (mid: string) => (mid === g.s.mid ? `${nm(mid)}(나)` : nm(mid));

  // 배포된 조편성: 내 조와 전체 조 구성(조에 없는 사람도 전체를 볼 수 있게). 배포 전 조편성은 개수만 알려 준다.
  const evGroups = groups.filter((x) => x.eventId === id);
  const myGroups = evGroups
    .filter((x) => x.published === "true")
    .map((x) => {
      const teams = gTeams(x);
      const t = teams.find((y) => y.memberIds.includes(g.s.mid));
      return {
        raw: teams, act: false,
        title: x.title, team: t?.name ?? "", members: t ? t.memberIds.map(nmMe) : [],
        teams: teams.map((y) => ({ name: y.name, members: y.memberIds.map(nmMe), mine: y.memberIds.includes(g.s.mid) })),
      };
    });
  let groupsPending = evGroups.filter((x) => x.published !== "true").length;

  // 팀 활동(활동 화면의 "팀 구성")에서 배포한 팀도 조편성처럼 보여 준다
  const acts = (await s.list("EventActivities")).filter((a) => a.eventId === id).sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  for (const a of acts) {
    const ts = await teams(a.id);
    if (ts.length === 0) continue;
    if (!(await teamsState(a.id)).published) {
      groupsPending++;
      continue;
    }
    const t = ts.find((y) => y.memberIds.includes(g.s.mid));
    myGroups.push({
      raw: ts, act: true,
      title: parseJson<{ name?: string }>(a.config, {}).name ?? "팀 활동", team: t?.name ?? "", members: t ? t.memberIds.map(nmMe) : [],
      teams: ts.map((y) => ({ name: y.name, members: y.memberIds.map(nmMe), mine: y.memberIds.includes(g.s.mid) })),
    });
  }

  // 구성이 같은 조편성은 한 칸으로 합친다. titles: 이 구성을 쓰는 곳
  //  - 조 이름과 조원이 모두 같으면 같다
  //  - 활동 팀이 일정 조편성에서 활동에 참여하지 않는 사람만 뺀 것이면(조편성 가져오기) 그 조편성과 같다
  type Raw = { name: string; memberIds: string[] }[];
  const sigOf = (teams: Raw, only?: Set<string>) => JSON.stringify(
    teams.map((y) => [y.name, y.memberIds.filter((m) => !only || only.has(m)).sort()] as const)
      .filter(([, ms]) => ms.length > 0)
      .sort((p, q) => p[0].localeCompare(q[0])),
  );
  const merged: (Omit<(typeof myGroups)[number], "raw" | "act"> & { titles: string[]; raw: Raw; act: boolean })[] = [];
  for (const x of myGroups) {
    const inAct = new Set(x.raw.flatMap((y) => y.memberIds));
    const same = merged.find((m) => sigOf(m.raw) === sigOf(x.raw) || (x.act && !m.act && sigOf(m.raw, inAct) === sigOf(x.raw)));
    if (same) same.titles.push(x.title);
    else merged.push({ ...x, titles: [x.title] });
  }
  const groupsOut = merged.map(({ raw: _r, act: _a, ...rest }) => { void _r; void _a; return rest; });

  // 구간별(갈 때 → 올 때)로 내가 운전하거나 타는 차량. 확정된 자리만 보인다(승인만 되고 확정 전이면 안 보임).
  const carReqs = await carRequests(id);
  const myCars = state.published
    ? DIRS.flatMap((d) =>
        all
          .filter((c) => c[d].on && ((c.kind !== "rental" && c.driverId === g.s.mid) || visibleRiders(c, d, carReqs).includes(g.s.mid)))
          .map((c) => {
            const seen = visibleRiders(c, d, carReqs);
            const driver = driverLabel(c, nm);
            return {
              dir: d, leg: DIR_LABEL[d], name: c.name, plate: c.plate, from: c[d].from, to: c[d].to, departAt: c[d].departAt, arriveAt: c[d].arriveAt,
              driver, iDrive: c.kind !== "rental" && !!c.driverId && c.driverId === g.s.mid, riders: seen.filter((x) => x !== g.s.mid).map(nm), seats: legSeats(c, d), memo: c[d].memo,
              // 이 차에 타는 모든 사람(운전자 먼저, 나 포함). 외부 대절은 운전자 이름 그대로
              people: [...(driver ? [`${c.kind !== "rental" && c.driverId ? nmMe(c.driverId) : driver} · 운전`] : []), ...seen.filter((x) => x !== c.driverId).map(nmMe)],
            };
          }),
      )
    : [];

  const [roomSt, allRooms] = await Promise.all([roomState(id), rooms(id)]);
  const myRooms = roomSt.published
    ? allRooms
        .filter((r) => r.guests.includes(g.s.mid))
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((r) => ({ date: r.date, name: r.name, memo: r.memo, mates: r.guests.filter((x) => x !== g.s.mid).map(nm), people: r.guests.map(nmMe) }))
    : [];

  // 미응답·불참 회원에게 닫힌 항목(세부일정·조편성·숙소·차량)은 보내지 않는다(lib/event-visibility.ts)
  //  lockedCards: 회원 화면에 잠긴 칸으로 보여 줄 항목(그 항목이 이 일정에 실제로 있을 때만)
  const myApply = (await s.list("EventApplies")).find((x) => x.eventId === id && x.memberId === g.s.mid);
  //  관리하는 사람의 미리보기(preview)는 일정 개요(/api/events/[id])처럼 모두 열어 둔다
  const lk = lockedFor(ev, myApply?.answer === "참석" || preview);
  const schedLocked = lk.includes("schedule");
  const lockedCards = [
    ...(lk.includes("groups") && (evGroups.length > 0 || myGroups.length > 0 || groupsPending > 0) ? ["groups"] : []),
    ...(lk.includes("rooms") && allRooms.length > 0 ? ["rooms"] : []),
    ...(lk.includes("cars") && (all.length > 0 || state.published) ? ["cars"] : []),
  ];
  return NextResponse.json({
    lockedCards,
    // 이 일정이 조편성(팀 활동 포함)·숙소 배정을 쓰는지: 쓰는 일정에만 "배정 전" 안내 칸을 보여 준다
    usesGroups: evGroups.length > 0 || myGroups.length > 0 || groupsPending > 0,
    usesRooms: allRooms.length > 0,
    rooms: lk.includes("rooms") ? { published: false, mine: [] } : { published: roomSt.published, mine: myRooms },
    schedule: schedLocked ? [] : sched.filter((r) => r.eventId === id).sort((a, b) => a.at.localeCompare(b.at)).map((r) => ({ at: r.at, title: r.title, place: r.place ?? "", memo: r.memo ?? "" })),
    dayPlaces: readDayPlaces(ev.dayPlaces), // 세부일정 날짜별 기본 위치
    groups: lk.includes("groups") ? [] : groupsOut,
    groupsPending: lk.includes("groups") ? 0 : groupsPending,
    groupsLocked: lk.includes("groups"),
    carpool: lk.includes("cars") ? { published: false, mine: [] } : { published: state.published, mine: myCars },
  });
}
