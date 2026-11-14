import { NextResponse } from "next/server";
import { bad, guard, parseJson } from "@/lib/api";
import { eventVisible } from "@/lib/audience";
import { minutesData, zodMessage, type MinutesData } from "@/lib/board";
import { AGENDA_LABELS_KEY, type AgendaLabels } from "@/lib/club";
import { normType } from "@/lib/event-types";
import { effectivePerms, getPermGroups } from "@/lib/perms";
import { getSetting, getStore } from "@/lib/store";
import type { Row } from "@/lib/store/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// 회의 일정의 회의록.
//  보기: 그 일정을 볼 수 있는 회원(eventVisible) + 회의록을 고칠 수 있는 관리자(공개 전 초안도)
//  고치기: 지금 DB 기준 권한(all / events / minutes)이 있는 관리자 — 게시판처럼 세션이 아니라 실시간 권한으로 확인한다.
async function load(id: string) {
  const g = await guard();
  if ("err" in g) return { err: g.err };
  const s = await getStore();
  const [events, members] = await Promise.all([s.list("Events"), s.list("Members")]);
  const me = members.find((m) => m.id === g.s.mid);
  if (!me) return { err: bad("회원 정보를 찾을 수 없어요.", 401) };
  const perms = effectivePerms(me, await getPermGroups());
  const canEdit = ["all", "events", "minutes"].some((p) => perms.includes(p));
  const e = events.find((x) => x.id === id && (canEdit || eventVisible(x, me)));
  if (!e) return { err: bad("일정을 찾을 수 없어요.", 404) };
  return { e, canEdit };
}

// 저장된 회의록(없으면 빈 회의록). 일시·장소가 비어 있으면 일정의 시간·장소를 쓴다.
function view(e: Row): MinutesData & { saved: boolean } {
  const raw = parseJson<unknown>(e.minutes, null);
  const p = minutesData.safeParse(raw ?? {});
  const m = p.success ? p.data : minutesData.parse({});
  return { ...m, heldAt: m.heldAt || (e.startsAt ?? "").slice(0, 16), place: m.place || e.place || "", saved: raw !== null };
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const r = await load(id);
  if ("err" in r) return r.err;
  if (normType(r.e.type) !== "회의") return bad("회의 일정에만 회의록이 있어요.");
  return NextResponse.json({ minutes: view(r.e), canEdit: r.canEdit, labels: await getSetting<AgendaLabels>(AGENDA_LABELS_KEY, {}) });
}

export async function PUT(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const r = await load(id);
  if ("err" in r) return r.err;
  if (!r.canEdit) return NextResponse.json({ error: "회의록은 관리자(일정·회의록 권한)만 고칠 수 있어요." }, { status: 403 });
  if (normType(r.e.type) !== "회의") return bad("회의 일정에만 회의록을 쓸 수 있어요.");
  const p = minutesData.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad(zodMessage(p.error, "회의록 내용을 확인해 주세요."));
  const row = await (await getStore()).update("Events", id, { minutes: JSON.stringify(p.data) });
  if (!row) return bad("일정을 찾을 수 없어요.", 404);
  return NextResponse.json({ minutes: view(row), canEdit: true });
}
