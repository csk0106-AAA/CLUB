import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { readConfig, templateInput } from "@/lib/activities";
import { getStore } from "@/lib/store";
import { createVersion, editable, eventSource, sameConfig } from "@/lib/template-versions";

type Ctx = { params: Promise<{ id: string; aid: string }> };

// 일정 활동의 설정 수정: 이 활동이 쓰는 템플릿의 새 버전(vN, “일정명_날짜에서 수정”)으로 저장하고
// 이 활동이 그 버전을 쓰게 한다. 다른 일정의 활동은 쓰던 버전을 그대로 쓴다.
export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guard("activities");
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const parsed = templateInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("활동 설정을 확인해 주세요.");
  const s = await getStore();
  const [acts, events, tpls, lives] = await Promise.all([s.list("EventActivities"), s.list("Events"), s.list("ActivityTemplates"), s.list("LiveState")]);
  const cur = acts.find((a) => a.id === aid && a.eventId === id);
  const ev = events.find((e) => e.id === id);
  if (!cur || !ev) return bad("활동을 찾을 수 없어요.", 404);
  const old = readConfig(cur.config);

  // 현장 진행 중인 단계를 지우면 진행 상태가 가리킬 곳이 없어지므로 막는다.
  const live = lives.find((l) => l.eventActivityId === aid);
  if (live?.step && !parsed.data.onsite.steps.some((x) => x.key === live.step)) {
    return bad("지금 진행 중인 단계는 지울 수 없어요. 현장 진행을 먼저 되돌려 주세요.");
  }

  const tpl = tpls.find((t) => t.id === cur.templateId);
  const tplCfg = readConfig(tpl?.config);
  // AI 설정은 이 편집기에서 고치지 않으므로 지금 쓰이는 값(템플릿 버전)을 그대로 이어받는다.
  const input = editable({
    ...parsed.data,
    ...(tplCfg ? { aiGuides: tplCfg.aiGuides, aiCommon: tplCfg.aiCommon, interview: tplCfg.interview } : {}),
  });
  if (old && sameConfig(old, input) && (!tplCfg || sameConfig(tplCfg, input))) return NextResponse.json({ ok: true, unchanged: true });

  if (!tpl || !tplCfg) {
    // 원래 템플릿이 없어진 활동: 이 활동의 설정만 고친다
    const config = { ...input, id: old?.id ?? aid, version: old?.version ?? 1 };
    await s.update("EventActivities", aid, { config: JSON.stringify(config) });
    return NextResponse.json({ ok: true });
  }
  const v = await createVersion(s, tpl, input, eventSource(ev));
  await s.update("EventActivities", aid, { templateId: v.id, templateVersion: String(v.version), config: JSON.stringify(v.config) });
  return NextResponse.json({ ok: true, templateId: v.id, version: v.version });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const g = await guard("activities");
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const s = await getStore();
  const cur = (await s.list("EventActivities")).find((a) => a.id === aid && a.eventId === id);
  if (!cur) return bad("활동을 찾을 수 없어요.", 404);
  await s.remove("EventActivities", aid);
  const live = (await s.list("LiveState")).find((l) => l.eventActivityId === aid);
  if (live) await s.remove("LiveState", live.id);
  return NextResponse.json({ ok: true });
}
