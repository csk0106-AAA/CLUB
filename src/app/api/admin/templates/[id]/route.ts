import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { readConfig, templateInput } from "@/lib/activities";
import { getStore } from "@/lib/store";
import { createVersion, deleteBlock, editable, sameConfig } from "@/lib/template-versions";

type Ctx = { params: Promise<{ id: string }> };

// 템플릿 수정: 고친 버전(이 id)은 그대로 두고, 같은 템플릿의 새 버전(vN)을 만든다.
// 이미 일정에 넣은 활동은 넣을 때 고른 버전을 계속 쓴다.
export async function PUT(req: Request, ctx: Ctx) {
  const g = await guard("activities");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = templateInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("템플릿 설정을 확인해 주세요.");
  const s = await getStore();
  const cur = (await s.list("ActivityTemplates")).find((t) => t.id === id);
  const curCfg = readConfig(cur?.config);
  if (!cur || !curCfg) return bad("템플릿을 찾을 수 없어요.", 404);
  if (sameConfig(curCfg, parsed.data)) return NextResponse.json({ unchanged: true, template: { id, origin: cur.origin, version: curCfg.version, config: curCfg } });
  const v = await createVersion(s, cur, editable(parsed.data));
  return NextResponse.json({ template: { id: v.id, origin: "version", version: v.version, config: v.config } });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const g = await guard("activities");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const s = await getStore();
  const [rows, acts] = await Promise.all([s.list("ActivityTemplates"), s.list("EventActivities")]);
  const cur = rows.find((t) => t.id === id);
  if (!cur) return bad("템플릿을 찾을 수 없어요.", 404);
  const why = deleteBlock(rows, acts, cur);
  if (why) return bad(why);
  await s.remove("ActivityTemplates", id);
  return NextResponse.json({ ok: true });
}
