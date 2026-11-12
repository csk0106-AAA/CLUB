import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { AGENDA_LABELS_KEY, AGENDA_STATUS, type AgendaLabels } from "@/lib/club";
import { getSetting, setSetting } from "@/lib/store";

export const dynamic = "force-dynamic";

// 회의록 안건 상태의 화면 이름. 비어 있는 값은 기본 이름(내부 값)을 쓴다.
export async function GET() {
  const g = await guard(["members", "minutes"]);
  if ("err" in g) return g.err;
  const saved = await getSetting<AgendaLabels>(AGENDA_LABELS_KEY, {});
  return NextResponse.json({ statuses: AGENDA_STATUS, labels: saved });
}

const body = z.object({ labels: z.record(z.string().trim().max(20)) });

export async function PUT(req: Request) {
  const g = await guard("minutes");
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("상태 이름은 20자까지 적을 수 있어요.");
  const out: AgendaLabels = {};
  for (const k of AGENDA_STATUS) {
    const v = parsed.data.labels[k];
    if (v && v !== k) out[k] = v;
  }
  const shown = AGENDA_STATUS.map((k) => out[k] ?? k);
  if (new Set(shown).size !== shown.length) return bad("상태 이름이 서로 겹쳐요. 다른 이름으로 정해 주세요.");
  await setSetting(AGENDA_LABELS_KEY, out);
  return NextResponse.json({ labels: out });
}
