import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { DEV_STATUSES } from "@/lib/dev-requests";
import { getStore } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };

// 개발 요청 상태 바꾸기(접수 / 진행 중 / 완료 / 보류) — 전체 관리자만
const body = z.object({ status: z.enum(DEV_STATUSES) });

export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guard("all");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("상태를 골라 주세요.");
  const s = await getStore();
  if (!(await s.list("DevRequests")).some((r) => r.id === id)) return bad("요청을 찾을 수 없어요.", 404);
  await s.update("DevRequests", id, { status: parsed.data.status, updatedAt: new Date().toISOString() });
  return NextResponse.json({ ok: true, status: parsed.data.status });
}

// 개발 요청 지우기 — 전체 관리자만
export async function DELETE(_req: Request, ctx: Ctx) {
  const g = await guard("all");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const s = await getStore();
  if (!(await s.list("DevRequests")).some((r) => r.id === id)) return bad("요청을 찾을 수 없어요.", 404);
  await s.remove("DevRequests", id);
  return NextResponse.json({ ok: true });
}
