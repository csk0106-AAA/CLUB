import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { countsOf, KINDS, markSeen, type Kind } from "@/lib/unread";

export const dynamic = "force-dynamic";

// 하단 아이콘 숫자: { events, posts, profiles }
export async function GET() {
  const g = await guard();
  if ("err" in g) return g.err;
  return NextResponse.json(await countsOf(g.s.mid));
}

const body = z.object({ kind: z.enum(KINDS as [Kind, ...Kind[]]) });

// 그 탭을 열면 "봤음"으로 표시하고 남은 숫자를 돌려준다.
export async function POST(req: Request) {
  const g = await guard();
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("종류를 확인해 주세요.");
  await markSeen(g.s.mid, parsed.data.kind);
  return NextResponse.json(await countsOf(g.s.mid));
}
