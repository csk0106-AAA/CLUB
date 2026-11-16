import { NextResponse } from "next/server";
import { z } from "zod";
import { readConfig } from "@/lib/activities";
import { aiSettingsInput, cleanAiSettings } from "@/lib/ai-guides";
import { adminOrOfficer, bad } from "@/lib/api";
import { getStore } from "@/lib/store";
import { SAVE_MODES, saveTemplate } from "@/lib/template-versions";

type Ctx = { params: Promise<{ id: string }> };

// 활동 템플릿의 AI 설정(지점별 지침, 이 활동 공통 지침, 인터뷰 질문)을 바꾼다.
// 저장 방법(mode)은 설정 저장과 같다: fix(이 버전 고치기) / version(새 버전, 기본) / new(새 활동, name 필요)
const body = aiSettingsInput.extend({ mode: z.enum(SAVE_MODES).default("version"), name: z.string().max(100).optional() });

export async function PUT(req: Request, ctx: Ctx) {
  const g = await adminOrOfficer("templates");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("지침은 4000자, 질문은 300자까지 쓸 수 있어요.");
  const s = await getStore();
  const cur = (await s.list("ActivityTemplates")).find((t) => t.id === id);
  const cfg = readConfig(cur?.config);
  if (!cur || !cfg) return bad("템플릿을 찾을 수 없어요.", 404);

  const { mode, name, ...input } = parsed.data;
  const ai = cleanAiSettings(cfg, input);
  const r = await saveTemplate(s, cur, { ...cfg, ...ai }, mode, { name });
  if (!r.ok) return bad(r.error, r.status);
  return NextResponse.json({ ...ai, mode: r.mode, unchanged: r.unchanged, propagated: r.propagated ?? 0, templateId: r.id, version: r.version });
}
