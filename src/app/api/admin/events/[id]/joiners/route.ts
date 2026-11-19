import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guardEv } from "@/lib/api";
import { readAudience } from "@/lib/audience";
import { eventJoiners } from "@/lib/new-joiners";
import { getSetting, getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

async function load(id: string) {
  const s = await getStore();
  const [e, members, stamps] = await Promise.all([s.get("Events", id), s.list("Members"), getSetting<Record<string, string>>("eventStamps", {})]);
  return { s, e, joiners: e ? eventJoiners(e, members, stamps) : [] };
}

// 공개한 뒤 새로 가입했는데 이 일정의 공개 대상에 없는 회원(lib/new-joiners.ts)
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, "events");
  if ("err" in g) return g.err;
  const { e, joiners } = await load((await ctx.params).id);
  if (!e) return bad("일정을 찾을 수 없어요.", 404);
  return NextResponse.json({ joiners });
}

const body = z.object({ action: z.enum(["add", "dismiss"]) });

// add: 공개 대상에 넣기 / dismiss: 넣지 않고 알림 끄기(이 뒤에 가입한 회원은 다시 알린다)
export async function POST(req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, "events");
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("요청을 확인해 주세요.");
  const { s, e, joiners } = await load((await ctx.params).id);
  if (!e) return bad("일정을 찾을 수 없어요.", 404);
  const now = new Date().toISOString();
  if (parsed.data.action === "add" && joiners.length) {
    const aud = readAudience(e.audience);
    await s.update("Events", e.id, { audience: JSON.stringify({ ...aud, memberIds: [...new Set([...aud.memberIds, ...joiners.map((j) => j.id)])] }), audSeenAt: now });
  } else {
    await s.update("Events", e.id, { audSeenAt: now });
  }
  return NextResponse.json({ ok: true, added: parsed.data.action === "add" ? joiners.length : 0 });
}
