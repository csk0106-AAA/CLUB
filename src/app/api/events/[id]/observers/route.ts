import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { can, type Session } from "@/lib/auth";
import { readObservers } from "@/lib/audience";
import { isClubLeader } from "@/lib/clubs";
import { memberClubs } from "@/lib/lists";
import { notifyEvent } from "@/lib/push";
import { getStore } from "@/lib/store";
import type { Row } from "@/lib/store/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// 소모임 행사의 참관자(소모임 밖 회원). 그 소모임의 직책자(회장 등, Members.clubs 실시간)나
// 행사 권한이 있는 관리자만 볼 수 있고 바꿀 수 있다.
async function load(s: Session, id: string): Promise<{ ev: Row; members: Row[] } | NextResponse> {
  const store = await getStore();
  const [events, members] = await Promise.all([store.list("Events"), store.list("Members")]);
  const ev = events.find((e) => e.id === id);
  if (!ev) return bad("행사를 찾을 수 없어요.", 404);
  const club = (ev.club ?? "").trim();
  if (!club) return bad("소모임 행사에서만 참관자를 정할 수 있어요.");
  const me = members.find((m) => m.id === s.mid);
  if (!can(s, "events") && !isClubLeader(me, club)) return bad("이 소모임의 회장(직책자)만 참관자를 정할 수 있어요.", 403);
  return { ev, members };
}

const inClub = (m: Row, club: string) => memberClubs(m).some((c) => c.name === club);

function view(ev: Row, members: Row[]) {
  const club = ev.club.trim();
  const ids = readObservers(ev.observers);
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? "(지운 회원)";
  return {
    club,
    observers: ids.map((id) => ({ id, name: name(id) })),
    // 참관자로 고를 수 있는 회원: 소모임 밖 회원(회원대기 제외)
    candidates: members
      .filter((m) => m.kind !== "회원대기" && !inClub(m, club))
      .map((m) => ({ id: m.id, name: m.name, kind: m.kind, position: m.position }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko")),
  };
}

export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard();
  if ("err" in g) return g.err;
  const r = await load(g.s, (await ctx.params).id);
  if (r instanceof NextResponse) return r;
  return NextResponse.json(view(r.ev, r.members));
}

const body = z.object({ observers: z.array(z.string().min(1).max(64)).max(500) });

export async function PUT(req: Request, ctx: Ctx) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요.");
  const r = await load(g.s, id);
  if (r instanceof NextResponse) return r;
  const { ev, members } = r;
  const club = ev.club.trim();
  const next = [...new Set(parsed.data.observers)];
  for (const mid of next) {
    const m = members.find((x) => x.id === mid);
    if (!m) return bad("명단에 없는 회원이 있어요. 새로고침 후 다시 해 주세요.");
    if (inClub(m, club)) return bad(`${m.name} 님은 이미 ${club} 회원이라 참관자로 넣지 않아도 돼요.`);
  }
  const before = readObservers(ev.observers);
  const changed = before.length !== next.length || before.some((x) => !next.includes(x));
  if (changed) {
    const store = await getStore();
    const row = await store.update("Events", id, { observers: next.length ? JSON.stringify(next) : "" });
    if (row && row.published === "true") await notifyEvent(id, "update");
    if (row) ev.observers = row.observers;
  }
  return NextResponse.json(view(ev, members));
}
