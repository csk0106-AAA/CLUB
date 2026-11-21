import { NextResponse } from "next/server";
import { hasBlock } from "@/lib/blocks";
import { bad, guard } from "@/lib/api";
import { sajuDelete, sajuPatch, sajuPost } from "@/lib/saju-run";
import { loadWho, writeClosed, writeGate } from "@/lib/who";

type Ctx = { params: Promise<{ aid: string }> };

// 소개 작성 활동(내가 누구일까요?·프로필 북)의 명리학 사주풀이. 처리는 lib/saju-run.ts(기능 블록 공용).
export async function POST(req: Request, ctx: Ctx) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;
  const closed = writeClosed(w) ?? (await writeGate(w, g.s.mid));
  if (closed) return closed;
  if (!hasBlock(w.cfg, "saju")) return bad("이 활동에는 명리학 사주풀이가 없어요.", 409);
  return sajuPost(g.s.mid, await req.json().catch(() => null), w.act);
}

export async function PATCH(req: Request) {
  const g = await guard();
  if ("err" in g) return g.err;
  return sajuPatch(g.s.mid, await req.json().catch(() => null));
}

export async function DELETE() {
  const g = await guard();
  if ("err" in g) return g.err;
  return sajuDelete(g.s.mid);
}
