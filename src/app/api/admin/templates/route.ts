import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { newTemplateId, readConfig, templateInput } from "@/lib/activities";
import { getStore } from "@/lib/store";
import { deleteBlock, editable, familyIdOf } from "@/lib/template-versions";

export const dynamic = "force-dynamic";

// 활동 템플릿 보관함: 모든 버전 행을 돌려준다. familyId(v1 id)로 묶어서 보여 준다.
//  uses: 이 버전을 쓰는 일정 활동 수, useEvents: 그 일정 id들, deletable/deleteWhy: 지울 수 있는지
export async function GET() {
  const g = await guard(["activities", "events"]);
  if ("err" in g) return g.err;
  const s = await getStore();
  const [rows, acts] = await Promise.all([s.list("ActivityTemplates"), s.list("EventActivities")]);
  const templates = rows.flatMap((r) => {
    const config = readConfig(r.config);
    if (!config) return [];
    const why = deleteBlock(rows, acts, r);
    return [{
      id: r.id,
      origin: r.origin,
      version: Number(r.version) || 1,
      familyId: familyIdOf(r),
      createdAt: r.createdAt ?? "",
      uses: acts.filter((a) => a.templateId === r.id).length,
      // 이 버전을 쓰는 일정 id(겹치지 않게) — “수정(이 버전 고치기)” 전에 몇 곳에 반영되는지 알려 준다
      useEvents: [...new Set(acts.filter((a) => a.templateId === r.id).map((a) => a.eventId))],
      deletable: !why,
      deleteWhy: why ?? "",
      config,
    }];
  });
  return NextResponse.json({ templates });
}

// 새 템플릿(v1). 복제도 버전이 아니라 새 템플릿으로 만든다.
export async function POST(req: Request) {
  const g = await guard("activities");
  if ("err" in g) return g.err;
  const parsed = templateInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("템플릿 설정을 확인해 주세요. 이름과 현장 단계가 필요해요.");
  const id = newTemplateId();
  const config = { ...editable(parsed.data), id, version: 1 };
  const s = await getStore();
  await s.insert("ActivityTemplates", {
    id, name: config.name, version: "1", config: JSON.stringify(config), origin: "custom", createdAt: new Date().toISOString(),
  });
  return NextResponse.json({ template: { id, origin: "custom", version: 1, familyId: id, config } });
}
