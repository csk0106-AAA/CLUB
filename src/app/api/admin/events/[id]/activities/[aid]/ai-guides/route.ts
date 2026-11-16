import { NextResponse } from "next/server";
import { z } from "zod";
import { readConfig } from "@/lib/activities";
import { aiSettingsInput, cleanAiSettings } from "@/lib/ai-guides";
import { bad, guardEv } from "@/lib/api";
import { getStore } from "@/lib/store";
import { eventSource, SAVE_MODES, saveTemplate } from "@/lib/template-versions";

type Ctx = { params: Promise<{ id: string; aid: string }> };

// 일정 활동의 AI 지침 저장. 저장 방법(mode)은 설정 저장과 같다.
//  fix: 이 활동이 쓰는 템플릿 버전을 고친다 / version: 새 버전을 만들고 이 활동이 그 버전을 쓴다(기본)
//  new: 새 활동 템플릿(v1, name 필요)을 만들고 이 활동이 그것을 쓴다
const body = aiSettingsInput.extend({ mode: z.enum(SAVE_MODES).default("version"), name: z.string().max(100).optional() });

export async function PUT(req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, ["templates", "events"]);
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

  const { mode, name, ...input } = parsed.data;
  const ai = cleanAiSettings(cfg, input);
  const tpl = tpls.find((t) => t.id === act.templateId);
  const tplCfg = readConfig(tpl?.config);
  // 저장할 설정 = 이 일정 활동의 설정 + 새 AI 설정
  const next = { ...cfg, ...ai };
  if (!tpl || !tplCfg) {
    // 원래 템플릿이 없어진 활동: 이 활동의 설정에만 저장한다
    await s.update("EventActivities", aid, { config: JSON.stringify(next) });
    return NextResponse.json({ mode: "fix", templateId: "", version: 0, propagated: 0 });
  }
  const r = await saveTemplate(s, tpl, next, mode, { name, sourceEvent: eventSource(ev), act: aid });
  if (!r.ok) return bad(r.error, r.status);
  if (r.unchanged) return NextResponse.json({ unchanged: true, mode: r.mode, templateId: act.templateId, version: tplCfg.version });
  if (r.mode !== "fix") {
    await s.update("EventActivities", aid, { templateId: r.id, templateVersion: String(r.version), config: JSON.stringify(r.config) });
  }
  return NextResponse.json({ mode: r.mode, templateId: r.id, version: r.version, name: r.config.name, propagated: r.propagated ?? 0 });
}
