import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { readConfig } from "@/lib/activities";
import { adminOrOfficer, bad } from "@/lib/api";
import { can } from "@/lib/auth";
import { devRequestInput, DEV_STATUSES, type DevRequest, type DevStatus } from "@/lib/dev-requests";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 개발 요청 목록(최근 것부터). canEdit: 상태를 바꿀 수 있는지(전체 관리자만)
// 관리자(활동·일정 권한) 또는 소모임 직책자가 보고 남길 수 있다.
export async function GET() {
  const g = await adminOrOfficer(["activities", "events"]);
  if ("err" in g) return g.err;
  const s = await getStore();
  const [rows, tpls, events] = await Promise.all([s.list("DevRequests"), s.list("ActivityTemplates"), s.list("Events")]);
  const requests: DevRequest[] = rows
    .map((r) => ({
      id: r.id, templateId: r.templateId, eventId: r.eventId, title: r.title, detail: r.detail, why: r.why,
      requestedBy: r.requestedBy,
      status: ((DEV_STATUSES as readonly string[]).includes(r.status) ? r.status : "접수") as DevStatus,
      createdAt: r.createdAt, updatedAt: r.updatedAt,
      templateName: (() => { const t = tpls.find((x) => x.id === r.templateId); const c = readConfig(t?.config); return c ? `${c.name} v${c.version}` : ""; })(),
      eventName: events.find((e) => e.id === r.eventId)?.name ?? "",
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ requests, canEdit: can(g.s, "all") });
}

// 개발 요청 남기기(활동 템플릿 권한)
export async function POST(req: Request) {
  const g = await adminOrOfficer("activities");
  if ("err" in g) return g.err;
  const parsed = devRequestInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("요청 제목과 내용을 적어 주세요.");
  const now = new Date().toISOString();
  const s = await getStore();
  const row = await s.insert("DevRequests", { id: `dev-${randomUUID().slice(0, 8)}`, ...parsed.data, requestedBy: g.s.name, status: "접수", createdAt: now, updatedAt: now });
  return NextResponse.json({ request: row });
}
