import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guardEv } from "@/lib/api";
import { readConfig, templateInput } from "@/lib/activities";
import { getStore } from "@/lib/store";
import { editable, eventSource, SAVE_MODES, saveTemplate } from "@/lib/template-versions";

type Ctx = { params: Promise<{ id: string; aid: string }> };

// 일정 활동의 설정 저장. 저장 방법은 고치는 사람이 고른다.
//  { config, mode: "fix" }      : 이 활동이 쓰는 템플릿 버전을 제자리에서 고친다(그 버전을 쓰는 다른 일정에도 바로 반영).
//  { config, mode: "version" }  : 그 템플릿의 새 버전(vN, “일정명_날짜에서 수정”)을 만들고 이 활동이 그 버전을 쓴다.
//  { config, mode: "new", name }: 새 활동 템플릿(v1)을 만들고 이 활동이 그 템플릿을 쓴다.
// (예전 형식: 본문이 설정 그대로면 새 버전으로 저장한다.)
const body = z.object({ config: z.unknown(), mode: z.enum(SAVE_MODES).default("version"), name: z.string().max(100).optional() });

export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, ["templates", "events"]);
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const raw = await req.json().catch(() => null);
  const b = body.safeParse(raw && typeof raw === "object" && "config" in raw ? raw : { config: raw });
  if (!b.success) return bad("저장 방법을 확인해 주세요.");
  const parsed = templateInput.safeParse(b.data.config);
  if (!parsed.success) return bad("활동 설정을 확인해 주세요.");
  const s = await getStore();
  const [acts, events, tpls, lives] = await Promise.all([s.list("EventActivities"), s.list("Events"), s.list("ActivityTemplates"), s.list("LiveState")]);
  const cur = acts.find((a) => a.id === aid && a.eventId === id);
  const ev = events.find((e) => e.id === id);
  if (!cur || !ev) return bad("활동을 찾을 수 없어요.", 404);
  const old = readConfig(cur.config);

  const tpl = tpls.find((t) => t.id === cur.templateId);
  const tplCfg = readConfig(tpl?.config);
  // AI 설정은 이 편집기에서 고치지 않으므로 지금 쓰이는 값(템플릿 버전)을 그대로 이어받는다.
  const input = editable({
    ...parsed.data,
    ...(tplCfg ? { aiGuides: tplCfg.aiGuides, aiCommon: tplCfg.aiCommon, interview: tplCfg.interview } : {}),
  });

  if (!tpl || !tplCfg) {
    // 원래 템플릿이 없어진 활동: 이 활동의 설정만 고친다
    const live = lives.find((l) => l.eventActivityId === aid);
    if (live?.step && !input.onsite.steps.some((x) => x.key === live.step)) {
      return bad("지금 진행 중인 단계는 지울 수 없어요. 현장 진행을 먼저 되돌려 주세요.");
    }
    const config = { ...input, id: old?.id ?? aid, version: old?.version ?? 1 };
    await s.update("EventActivities", aid, { config: JSON.stringify(config) });
    return NextResponse.json({ ok: true, mode: "fix", propagated: 0 });
  }

  const r = await saveTemplate(s, tpl, input, b.data.mode, { name: b.data.name, sourceEvent: eventSource(ev), act: aid });
  if (!r.ok) return bad(r.error, r.status);
  if (r.unchanged) return NextResponse.json({ ok: true, unchanged: true, mode: r.mode });
  // 수정은 이 버전을 쓰는 활동(이 활동 포함)에 이미 반영됐다. 새 버전·새 활동은 이 활동만 새 것을 쓴다.
  if (r.mode !== "fix") {
    await s.update("EventActivities", aid, { templateId: r.id, templateVersion: String(r.version), config: JSON.stringify(r.config) });
  }
  return NextResponse.json({ ok: true, mode: r.mode, templateId: r.id, version: r.version, name: r.config.name, propagated: r.propagated ?? 0 });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, ["templates", "events"]);
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
