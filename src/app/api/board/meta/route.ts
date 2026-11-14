import { NextResponse } from "next/server";
import { AGENDA_LABELS_KEY, type AgendaLabels } from "@/lib/club";
import { getLists } from "@/lib/lists";
import { getSetting } from "@/lib/store";
import { getMe, getTemplates } from "../_lib/server";

export const dynamic = "force-dynamic";

// 글쓰기 화면에 필요한 것: 양식별 템플릿, 회원구분·직책 목록, 회의록 안건 상태 이름, 내 권한
export async function GET() {
  const m = await getMe();
  if ("err" in m) return m.err;
  const { me } = m;
  const [templates, lists, agendaLabels] = await Promise.all([getTemplates(), getLists(), getSetting<AgendaLabels>(AGENDA_LABELS_KEY, {})]);
  return NextResponse.json({
    templates,
    kinds: lists.memberKinds.map((k) => k.value),
    positions: lists.positions,
    agendaLabels,
    me: { id: me.row.id, canWrite: me.canWrite, manage: me.manage, isAll: me.isAll, tplAdmin: me.tplAdmin },
  });
}
