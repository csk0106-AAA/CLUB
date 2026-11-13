import { NextResponse } from "next/server";
import { z } from "zod";
import { newTemplateId, readConfig } from "@/lib/activities";
import { aiSettingsInput, cleanAiSettings } from "@/lib/ai-guides";
import { bad, guard } from "@/lib/api";
import { getStore } from "@/lib/store";

type Ctx = { params: Promise<{ id: string; aid: string }> };

// 지점별 지침·활동 공통 지침·인터뷰 질문 + 반영 범위
const body = aiSettingsInput.extend({
  // template: 원래 템플릿에도 반영 / event: 이 행사 활동에만(행사 템플릿으로 따로 저장)
  target: z.enum(["template", "event"]),
});

// 행사 활동의 AI 지침 저장.
//  template → 원래 템플릿(행사 템플릿이면 그 원본)의 지침을 바꾼다. 이 활동이 행사 템플릿을 쓰고 있으면 그것도 함께 맞춘다.
//  event    → 이 행사 전용 템플릿(“행사 템플릿 · 행사명_날짜”)에 저장하고 활동이 그 템플릿을 쓰게 한다.
export async function PUT(req: Request, ctx: Ctx) {
  const g = await guard("activities");
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("지침은 4000자, 질문은 300자까지 쓸 수 있어요.");

  const s = await getStore();
  const [acts, events, tpls] = await Promise.all([s.list("EventActivities"), s.list("Events"), s.list("ActivityTemplates")]);
  const act = acts.find((a) => a.id === aid && a.eventId === id);
  const ev = events.find((e) => e.id === id);
  const cfg = readConfig(act?.config);
  if (!act || !ev || !cfg) return bad("활동을 찾을 수 없어요.", 404);

  const ai = cleanAiSettings(cfg, parsed.data);

  const cur = tpls.find((t) => t.id === act.templateId);
  const curCfg = readConfig(cur?.config);
  const setGuides = async (tplId: string, c: NonNullable<typeof curCfg>) =>
    s.update("ActivityTemplates", tplId, { config: JSON.stringify({ ...c, ...ai }) });

  if (parsed.data.target === "template") {
    // 원본 템플릿: 지금 템플릿이 행사 템플릿이면 그 원본, 아니면 지금 템플릿
    const baseId = curCfg?.derivedFrom || act.templateId;
    const base = tpls.find((t) => t.id === baseId);
    const baseCfg = readConfig(base?.config);
    if (!base || !baseCfg) return bad("원래 템플릿을 찾을 수 없어요. “이 행사 활동에만”으로 저장해 주세요.", 404);
    await setGuides(base.id, baseCfg);
    if (cur && curCfg && cur.id !== base.id) await setGuides(cur.id, curCfg);
    await s.update("EventActivities", aid, { config: JSON.stringify({ ...cfg, ...ai }) });
    return NextResponse.json({ target: "template", templateId: act.templateId, templateName: baseCfg.name });
  }

  // 이 행사 활동에만: 이미 이 행사의 행사 템플릿을 쓰고 있으면 그것을 고치고, 아니면 새로 만든다.
  if (cur && curCfg && cur.origin === "event" && curCfg.sourceEvent?.id === id) {
    await setGuides(cur.id, curCfg);
    await s.update("EventActivities", aid, { config: JSON.stringify({ ...cfg, ...ai }) });
    return NextResponse.json({ target: "event", templateId: cur.id });
  }
  const tid = newTemplateId();
  const date = ev.startsAt ? ev.startsAt.slice(0, 10).replace(/-/g, "/") : "날짜 미정";
  const { id: _i, version: _v, ...rest } = cfg;
  void _i; void _v;
  const config = {
    ...rest, id: tid, version: 1, ...ai,
    derivedFrom: curCfg?.derivedFrom || act.templateId || undefined,
    sourceEvent: { id: ev.id, name: ev.name, date },
  };
  await s.insert("ActivityTemplates", { id: tid, name: config.name, version: "1", config: JSON.stringify(config), origin: "event" });
  await s.update("EventActivities", aid, { templateId: tid, config: JSON.stringify({ ...cfg, ...ai }) });
  return NextResponse.json({ target: "event", templateId: tid, label: `${ev.name}_${date}` });
}
