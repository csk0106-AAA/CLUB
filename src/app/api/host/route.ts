import { NextResponse } from "next/server";
import { getSession, can } from "@/lib/auth";
import { activityKind, activityMode, liveView, readConfig } from "@/lib/activities";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 사회자 첫 화면: 사회자 접속번호로 들어온 회원이 진행할 활동 목록.
// 관리자가 열면 mode "admin" 만 알려 준다(사회자 화면의 "돌아가기" 버튼을 고르는 데 쓴다).
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  if (!s.host) {
    const admin = can(s, "activities") || can(s, "events");
    return NextResponse.json({ mode: admin ? "admin" : "member", name: s.name, items: [] });
  }

  const st = await getStore();
  const [events, acts, lives] = await Promise.all([st.list("Events"), st.list("EventActivities"), st.list("LiveState")]);
  const items = acts
    // 지정이 풀렸거나 다른 사람으로 바뀌면 바로 목록에서 빠진다.
    .filter((a) => s.host!.includes(a.id) && a.hostId === s.mid)
    .flatMap((a) => {
      const cfg = readConfig(a.config);
      const ev = events.find((e) => e.id === a.eventId);
      if (!cfg || !ev) return [];
      const kind = activityKind(cfg);
      const screen =
        kind === "who" ? `/host/${ev.id}/${a.id}`
        : kind === "worry" ? `/host/worry/${ev.id}/${a.id}`
        : activityMode(cfg) === "team" ? `/host/teams/${ev.id}/${a.id}`
        : "";
      return [{
        eventId: ev.id,
        eventName: ev.name,
        id: a.id,
        name: cfg.name,
        startsAt: a.startsAt || ev.startsAt,
        endsAt: a.endsAt,
        screen,
        steps: cfg.onsite.steps.filter((x) => x.hostButton).map((x) => ({ key: x.key, label: x.hostButton })),
        live: liveView(cfg, lives.find((l) => l.eventActivityId === a.id)),
      }];
    })
    .sort((x, y) => x.startsAt.localeCompare(y.startsAt));
  return NextResponse.json({ mode: "host", name: s.name, items });
}
