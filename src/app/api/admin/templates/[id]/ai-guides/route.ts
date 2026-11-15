import { NextResponse } from "next/server";
import { readConfig } from "@/lib/activities";
import { aiSettingsInput, cleanAiSettings } from "@/lib/ai-guides";
import { bad, guard } from "@/lib/api";
import { getStore } from "@/lib/store";
import { createVersion, sameConfig } from "@/lib/template-versions";

type Ctx = { params: Promise<{ id: string }> };

// 활동 템플릿의 AI 설정(지점별 지침, 이 활동 공통 지침, 인터뷰 질문)을 바꾼다.
// 이 버전은 그대로 두고 같은 템플릿의 새 버전(vN)으로 저장한다. 이미 일정에 넣은 활동은 쓰던 버전을 그대로 쓴다.
export async function PUT(req: Request, ctx: Ctx) {
  const g = await guard("activities");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = aiSettingsInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("지침은 4000자, 질문은 300자까지 쓸 수 있어요.");
  const s = await getStore();
  const cur = (await s.list("ActivityTemplates")).find((t) => t.id === id);
  const cfg = readConfig(cur?.config);
  if (!cur || !cfg) return bad("템플릿을 찾을 수 없어요.", 404);

  const ai = cleanAiSettings(cfg, parsed.data);
  const next = { ...cfg, ...ai };
  if (sameConfig(cfg, next)) return NextResponse.json({ ...ai, unchanged: true, templateId: id, version: cfg.version });
  const v = await createVersion(s, cur, next);
  return NextResponse.json({ ...ai, templateId: v.id, version: v.version });
}
