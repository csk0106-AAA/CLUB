import { NextResponse } from "next/server";
import { bad, guardEv } from "@/lib/api";
import { ITEMS, isKind, syncPrepToCosts } from "@/lib/items";
import { getStore } from "@/lib/store";

type Ctx = { params: Promise<{ id: string; kind: string; rid: string }> };

async function find(ctx: Ctx) {
  const { id, kind, rid } = await ctx.params;
  if (!isKind(kind)) return { err: bad("없는 목록이에요.", 404) };
  const def = ITEMS[kind];
  const g = await guardEv(ctx, def.perm);
  if ("err" in g) return { err: g.err };
  const s = await getStore();
  const row = (await s.list(def.tab)).find((r) => r.id === rid && r.eventId === id);
  if (!row) return { err: bad("항목을 찾을 수 없어요.", 404) };
  return { def, s, row };
}

export async function PATCH(req: Request, ctx: Ctx) {
  const f = await find(ctx);
  if ("err" in f) return f.err;
  const parsed = f.def.schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요.");
  const row = await f.s.update(f.def.tab, f.row.id, parsed.data);
  // 준비물(완료·가격·비용 항목)이나 비용 항목 이름이 바뀌면 비용 집행을 다시 맞춘다
  if (f.def.tab === "EventPrep" || f.def.tab === "EventCosts") await syncPrepToCosts(f.row.eventId);
  return NextResponse.json({ item: f.def.view(row as NonNullable<typeof row>) });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const f = await find(ctx);
  if ("err" in f) return f.err;
  await f.s.remove(f.def.tab, f.row.id);
  if (f.def.tab === "EventPrep") await syncPrepToCosts(f.row.eventId);
  return NextResponse.json({ ok: true });
}
