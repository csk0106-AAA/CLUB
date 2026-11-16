import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { readDayPlaces } from "@/lib/day-places";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 세부일정 날짜별 기본 위치 저장(비우면 지운다)
const body = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), place: z.string().trim().max(200) });

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("events");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("날짜와 위치를 확인해 주세요. 위치는 200자까지 적을 수 있어요.");
  const s = await getStore();
  const ev = (await s.list("Events")).find((e) => e.id === id);
  if (!ev) return bad("일정을 찾을 수 없어요.", 404);
  const map = readDayPlaces(ev.dayPlaces);
  if (parsed.data.place) map[parsed.data.day] = parsed.data.place;
  else delete map[parsed.data.day];
  await s.update("Events", id, { dayPlaces: Object.keys(map).length ? JSON.stringify(map) : "" });
  return NextResponse.json({ dayPlaces: map });
}
