import { NextResponse } from "next/server";
import { readConfig } from "@/lib/activities";
import { aiSettingsInput, cleanAiSettings } from "@/lib/ai-guides";
import { bad, guard } from "@/lib/api";
import { getStore } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };

// 활동 템플릿의 AI 설정(지점별 지침, 이 활동 공통 지침, 인터뷰 질문)만 바꾼다.
// 템플릿 버전은 올리지 않고, 이 템플릿으로 넣은 일정 활동에도 바로 적용된다.
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
  await s.update("ActivityTemplates", id, { config: JSON.stringify({ ...cfg, ...ai }) });
  return NextResponse.json(ai);
}
