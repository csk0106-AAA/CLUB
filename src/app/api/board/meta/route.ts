import { NextResponse } from "next/server";
import { AGENDA_LABELS_KEY, type AgendaLabels } from "@/lib/club";
import { WRITE_FORMS } from "@/lib/board";
import { getLists } from "@/lib/lists";
import { getSetting } from "@/lib/store";
import { getMe, getTemplates } from "../_lib/server";

export const dynamic = "force-dynamic";

// 글쓰기 화면에 필요한 것: 고를 수 있는 양식과 양식별 템플릿, 회원구분·직책 목록, 회의록 안건 상태 이름, 내 권한
export async function GET() {
  const m = await getMe();
  if ("err" in m) return m.err;
  const { me } = m;
  const [all, lists, agendaLabels] = await Promise.all([getTemplates(), getLists(), getSetting<AgendaLabels>(AGENDA_LABELS_KEY, {})]);
  // 고를 수 있는 양식만(회의록은 일정 › 회의 일정에서 쓴다)
  const templates = Object.fromEntries(WRITE_FORMS.map((f) => [f, all[f]]));
  return NextResponse.json({
    forms: WRITE_FORMS,
    templates,
    kinds: lists.memberKinds.map((k) => k.value),
    positions: lists.positions,
    agendaLabels,
    me: { id: me.row.id, canWrite: me.canWrite, manage: me.manage, isAll: me.isAll, tplAdmin: me.tplAdmin },
  });
}
