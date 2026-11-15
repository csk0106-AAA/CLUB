import { NextResponse } from "next/server";
import { readConfig } from "@/lib/activities";
import { aiSettingsInput, cleanAiSettings } from "@/lib/ai-guides";
import { bad, guard } from "@/lib/api";
import { getStore } from "@/lib/store";
import { createVersion, eventSource, sameConfig } from "@/lib/template-versions";

type Ctx = { params: Promise<{ id: string; aid: string }> };

// 일정 활동의 AI 지침 저장: 이 활동이 쓰는 템플릿의 새 버전(vN, “일정명_날짜에서 수정”)으로 저장하고
// 이 활동이 그 버전을 쓰게 한다. 다른 일정의 활동은 쓰던 버전을 그대로 쓴다.
export async function PUT(req: Request, ctx: Ctx) {
  const g = await guard("activities");
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const parsed = aiSettingsInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("지침은 4000자, 질문은 300자까지 쓸 수 있어요.");

  const s = await getStore();
  const [acts, events, tpls] = await Promise.all([s.list("EventActivities"), s.list("Events"), s.list("ActivityTemplates")]);
  const act = acts.find((a) => a.id === aid && a.eventId === id);
  const ev = events.find((e) => e.id === id);
  const cfg = readConfig(act?.config);
  if (!act || !ev || !cfg) return bad("활동을 찾을 수 없어요.", 404);

  const ai = cleanAiSettings(cfg, parsed.data);
  const tpl = tpls.find((t) => t.id === act.templateId);
  const tplCfg = readConfig(tpl?.config);
  // 새 버전 = 이 일정 활동의 설정 + 새 AI 설정
  const next = { ...cfg, ...ai };
  if (tplCfg && sameConfig(tplCfg, next) && sameConfig(cfg, next)) {
    return NextResponse.json({ unchanged: true, templateId: act.templateId, version: tplCfg.version });
  }
  if (!tpl || !tplCfg) {
    // 원래 템플릿이 없어진 활동: 이 활동의 설정에만 저장한다
    await s.update("EventActivities", aid, { config: JSON.stringify(next) });
    return NextResponse.json({ templateId: "", version: 0 });
  }
  const v = await createVersion(s, tpl, next, eventSource(ev));
  await s.update("EventActivities", aid, { templateId: v.id, templateVersion: String(v.version), config: JSON.stringify(v.config) });
  return NextResponse.json({ templateId: v.id, version: v.version, label: `${v.config.sourceEvent?.name}_${v.config.sourceEvent?.date}` });
}
