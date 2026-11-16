import { NextResponse } from "next/server";
import { z } from "zod";
import { adminOrOfficer, bad, guard } from "@/lib/api";
import { templateInput } from "@/lib/activities";
import { getStore } from "@/lib/store";
import { deleteBlock, editable, SAVE_MODES, saveTemplate } from "@/lib/template-versions";

type Ctx = { params: Promise<{ id: string }> };

// 템플릿 저장. 저장 방법은 고치는 사람이 고른다.
//  { config, mode: "fix" }     : 이 버전을 제자리에서 고친다. 이 버전을 쓰는 일정 활동에도 바로 반영된다.
//  { config, mode: "version" } : 같은 템플릿의 새 버전(vN)을 만든다. 이 버전과 이미 일정에 넣은 활동은 그대로.
//  { config, mode: "new", name }: 새 활동 템플릿(v1)으로 따로 만든다.
// (예전 형식: 본문이 설정 그대로면 새 버전으로 저장한다.)
const body = z.object({ config: z.unknown(), mode: z.enum(SAVE_MODES).default("version"), name: z.string().max(100).optional() });

// 저장은 관리자(활동 권한) 또는 소모임 직책자. 지우기(DELETE)는 관리자만.
export async function PUT(req: Request, ctx: Ctx) {
  const g = await adminOrOfficer("templates");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const raw = await req.json().catch(() => null);
  const b = body.safeParse(raw && typeof raw === "object" && "config" in raw ? raw : { config: raw });
  if (!b.success) return bad("저장 방법을 확인해 주세요.");
  const parsed = templateInput.safeParse(b.data.config);
  if (!parsed.success) return bad("템플릿 설정을 확인해 주세요.");
  const s = await getStore();
  const cur = (await s.list("ActivityTemplates")).find((t) => t.id === id);
  if (!cur) return bad("템플릿을 찾을 수 없어요.", 404);
  const r = await saveTemplate(s, cur, editable(parsed.data), b.data.mode, { name: b.data.name });
  if (!r.ok) return bad(r.error, r.status);
  return NextResponse.json({
    mode: r.mode,
    unchanged: r.unchanged,
    propagated: r.propagated ?? 0,
    template: { id: r.id, origin: r.mode === "new" ? "custom" : r.mode === "version" && !r.unchanged ? "version" : cur.origin, version: r.version, config: r.config },
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const g = await guard("templates");
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
