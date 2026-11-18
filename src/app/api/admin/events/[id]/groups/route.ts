import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guardEv } from "@/lib/api";
import { activityMode, readConfig } from "@/lib/activities";
import { teams } from "@/lib/capsule";
import { gTeams } from "@/lib/groups";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// 조편성 목록(활동 개수에 따라 여러 개를 만들 수 있다)
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, ["events", "templates"]);
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const s = await getStore();
  const rows = (await s.list("Groupings")).filter((x) => x.eventId === id);
  // 조편성으로 복사해 올 수 있는 활동: 이 일정의 팀 활동 중 팀이 짜인 것
  const sources: { id: string; name: string; teamCount: number }[] = [];
  for (const a of (await s.list("EventActivities")).filter((x) => x.eventId === id).sort((p, q) => Number(p.order) - Number(q.order))) {
    const cfg = readConfig(a.config);
    if (!cfg || activityMode(cfg) !== "team") continue;
    const ts = await teams(a.id);
    if (ts.length) sources.push({ id: a.id, name: cfg.name, teamCount: ts.length });
  }
  return NextResponse.json({
    sources,
    groups: rows.map((x) => {
      const t = gTeams(x);
      return { id: x.id, title: x.title, published: x.published === "true", teamCount: t.length, memberCount: t.reduce((n, y) => n + y.memberIds.length, 0) };
    }),
  });
}

// fromActivity: 그 활동의 팀 구성을 그대로 복사해 만든다(초안. 이후 따로 고칠 수 있고 서로 연결되지 않는다)
const body = z.object({ title: z.string().trim().min(1).max(60), fromActivity: z.string().optional() });

export async function POST(req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, ["events", "templates"]);
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("조편성 이름을 입력해 주세요. 예: 저녁 게임");
  const s = await getStore();
  if (!(await s.list("Events")).some((e) => e.id === id)) return bad("일정을 찾을 수 없어요.", 404);
  let copied: { name: string; memberIds: string[] }[] = [];
  if (parsed.data.fromActivity) {
    const act = (await s.list("EventActivities")).find((a) => a.id === parsed.data.fromActivity && a.eventId === id);
    if (!act) return bad("복사할 활동을 찾을 수 없어요.", 404);
    copied = (await teams(act.id)).map((t) => ({ name: t.name.slice(0, 20), memberIds: t.memberIds }));
    if (copied.length === 0) return bad("그 활동에는 아직 짜인 팀이 없어요.");
  }
  const row = await s.insert("Groupings", { eventId: id, title: parsed.data.title, teams: JSON.stringify(copied), published: "false", updatedAt: new Date().toISOString() });
  return NextResponse.json({ id: row.id, copied: copied.length });
}
