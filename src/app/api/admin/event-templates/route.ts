import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { readTemplates, removeTemplate, saveTemplate, templateSummary } from "@/lib/event-template";

export const dynamic = "force-dynamic";

// 일정 유형별 템플릿(lib/event-template.ts): 보기는 일정을 만들 수 있는 관리자, 저장·지우기는 일정관리 권한
export async function GET() {
  const g = await guard(["events", "evMain", "evClub", "clubs"]);
  if ("err" in g) return g.err;
  const all = await readTemplates();
  return NextResponse.json({ templates: Object.fromEntries(Object.entries(all).map(([k, t]) => [k, templateSummary(t)])) });
}

const save = z.object({ eventId: z.string().min(1).max(80) });
export async function POST(req: Request) {
  const g = await guard("events");
  if ("err" in g) return g.err;
  const p = save.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad("일정을 골라 주세요.");
  const t = await saveTemplate(p.data.eventId);
  if (!t) return bad("일정을 찾을 수 없어요.", 404);
  return NextResponse.json({ template: templateSummary(t) });
}

const del = z.object({ type: z.string().min(1).max(20) });
export async function DELETE(req: Request) {
  const g = await guard("events");
  if ("err" in g) return g.err;
  const p = del.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad("유형을 골라 주세요.");
  await removeTemplate(p.data.type);
  return NextResponse.json({ ok: true });
}
