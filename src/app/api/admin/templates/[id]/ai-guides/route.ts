import { NextResponse } from "next/server";
import { z } from "zod";
import { readConfig } from "@/lib/activities";
import { AI_POINTS, aiPointsFor } from "@/lib/ai-guides";
import { bad, guard } from "@/lib/api";
import { getStore } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };
const KEYS = AI_POINTS.map((p) => p.key) as string[];

// 활동 템플릿의 AI 지침(지점별)만 바꾼다. 템플릿 버전은 올리지 않고, 이 템플릿으로 넣은 행사 활동에도 바로 적용된다.
const body = z.object({ aiGuides: z.record(z.string(), z.string().max(4000)) });

export async function PUT(req: Request, ctx: Ctx) {
  const g = await guard("activities");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("지침은 지점마다 4000자까지 쓸 수 있어요.");
  const s = await getStore();
  const cur = (await s.list("ActivityTemplates")).find((t) => t.id === id);
  const cfg = readConfig(cur?.config);
  if (!cur || !cfg) return bad("템플릿을 찾을 수 없어요.", 404);

  // 이 활동에서 쓰이는 지점만, 빈 값은 저장하지 않는다(→ 전체 지침 사용)
  const allowed = new Set(aiPointsFor(cfg) as string[]);
  const aiGuides = Object.fromEntries(
    Object.entries(parsed.data.aiGuides).map(([k, v]) => [k, v.trim()]).filter(([k, v]) => KEYS.includes(k) && allowed.has(k) && v),
  );
  const next = { ...cfg, aiGuides };
  await s.update("ActivityTemplates", id, { config: JSON.stringify(next) });
  return NextResponse.json({ aiGuides });
}
