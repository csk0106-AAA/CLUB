import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guardEv } from "@/lib/api";
import { ITEMS, isKind } from "@/lib/items";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; kind: string }> };

// 세부 일정 / 준비 목록 / 비용 목록. 비용은 '회비·비용' 권한이 있는 관리자만 다룬다.
export async function GET(_req: Request, ctx: Ctx) {
  const { id, kind } = await ctx.params;
  if (!isKind(kind)) return bad("없는 목록이에요.", 404);
  const def = ITEMS[kind];
  const g = await guardEv(ctx, [...def.perm, "all"]);
  if ("err" in g) return g.err;
  const s = await getStore();
  if (!(await s.list("Events")).some((e) => e.id === id)) return bad("일정을 찾을 수 없어요.", 404);
  const rows = (await s.list(def.tab)).filter((r) => r.eventId === id).sort(def.sort);
  return NextResponse.json({ items: rows.map(def.view) });
}

export async function POST(req: Request, ctx: Ctx) {
  const { id, kind } = await ctx.params;
  if (!isKind(kind)) return bad("없는 목록이에요.", 404);
  const def = ITEMS[kind];
  const g = await guardEv(ctx, def.perm);
  if ("err" in g) return g.err;
  const parsed = def.schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요.");
  const s = await getStore();
  if (!(await s.list("Events")).some((e) => e.id === id)) return bad("일정을 찾을 수 없어요.", 404);
  // 비용은 새 항목을 목록 맨 뒤에 둔다(끌어서 정한 순서 다음)
  const order = kind === "costs" ? { order: String((await s.list(def.tab)).filter((r) => r.eventId === id).reduce((n, r) => Math.max(n, Number(r.order) || 0), 0) + 1) } : {};
  const row = await s.insert(def.tab, { ...parsed.data, ...order, eventId: id });
  return NextResponse.json({ item: def.view(row) });
}

// 비용 목록 순서 바꾸기(끌어서 옮기기): 보낸 순서대로 order 를 1부터 매긴다
const orderBody = z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(500) });
export async function PUT(req: Request, ctx: Ctx) {
  const { id, kind } = await ctx.params;
  if (kind !== "costs") return bad("순서를 바꿀 수 없는 목록이에요.", 404);
  const def = ITEMS[kind];
  const g = await guardEv(ctx, def.perm);
  if ("err" in g) return g.err;
  const parsed = orderBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("순서를 확인해 주세요.");
  const s = await getStore();
  const rows = (await s.list(def.tab)).filter((r) => r.eventId === id);
  const ids = [...parsed.data.ids.filter((x) => rows.some((r) => r.id === x)), ...rows.sort(def.sort).map((r) => r.id).filter((x) => !parsed.data.ids.includes(x))];
  for (let i = 0; i < ids.length; i++) {
    const r = rows.find((x) => x.id === ids[i]);
    if (r && r.order !== String(i + 1)) await s.update(def.tab, r.id, { order: String(i + 1) });
  }
  return NextResponse.json({ ok: true });
}
