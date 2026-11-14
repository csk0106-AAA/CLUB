import { NextResponse } from "next/server";
import { bad } from "@/lib/api";
import { CLUB, clubError, isClubKind } from "@/lib/club";
import { getStore } from "@/lib/store";
import { clubGuard } from "../../_guard";

type Ctx = { params: Promise<{ kind: string; rid: string }> };

async function find(ctx: Ctx) {
  const { kind, rid } = await ctx.params;
  if (!isClubKind(kind)) return { err: bad("없는 항목이에요.", 404) };
  const def = CLUB[kind];
  const g = await clubGuard(kind);
  if ("err" in g) return { err: g.err };
  const s = await getStore();
  const row = (await s.list(def.tab)).find((r) => r.id === rid);
  if (!row) return { err: bad("항목을 찾을 수 없어요.", 404) };
  return { def, s, row, by: g.name };
}

export async function PATCH(req: Request, ctx: Ctx) {
  const f = await find(ctx);
  if ("err" in f) return f.err;
  const parsed = f.def.schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(clubError(parsed.error));
  const extra = f.def.audit ? f.def.audit(f.row, parsed.data, f.by) : {};
  const row = await f.s.update(f.def.tab, f.row.id, { ...parsed.data, ...extra });
  return NextResponse.json({ item: f.def.view(row as NonNullable<typeof row>) });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const f = await find(ctx);
  if ("err" in f) return f.err;
  await f.s.remove(f.def.tab, f.row.id);
  return NextResponse.json({ ok: true });
}
