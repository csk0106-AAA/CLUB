import { NextResponse } from "next/server";
import { bad, guardEv } from "@/lib/api";
import { fileResponse } from "@/lib/event-files";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; fid: string }> };

// 준비목록 파일 내려받기(관리자·작성자·편집자)
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, "events");
  if ("err" in g) return g.err;
  const { id, fid } = await ctx.params;
  const one = await (await getStore()).get("EventFiles", fid);
  const r = one && one.eventId === id ? one : null;
  if (!r) return bad("파일을 찾을 수 없어요.", 404);
  return fileResponse(r);
}

// 준비목록 파일 지우기
export async function DELETE(_req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, "events");
  if ("err" in g) return g.err;
  const { id, fid } = await ctx.params;
  const s = await getStore();
  const one = await s.get("EventFiles", fid);
  const r = one && one.eventId === id ? one : null;
  if (!r) return bad("파일을 찾을 수 없어요.", 404);
  await s.remove("EventFiles", fid);
  return NextResponse.json({ ok: true });
}
