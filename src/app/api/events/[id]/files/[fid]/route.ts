import { bad, guard } from "@/lib/api";
import { eventVisible } from "@/lib/audience";
import { fileResponse } from "@/lib/event-files";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 회원이 준비목록 파일 내려받기: 일정이 보이고, 관리자가 준비목록을 "회원에게 보이기"로 켠 경우만
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; fid: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { id, fid } = await ctx.params;
  const s = await getStore();
  const [events, members, files] = await Promise.all([s.list("Events"), s.list("Members"), s.list("EventFiles")]);
  const me = members.find((m) => m.id === g.s.mid);
  const e = events.find((x) => x.id === id && eventVisible(x, me ?? g.s.mid));
  if (!e || e.showPrep !== "true") return bad("파일을 찾을 수 없어요.", 404);
  const r = files.find((x) => x.id === fid && x.eventId === id);
  if (!r) return bad("파일을 찾을 수 없어요.", 404);
  return fileResponse(r);
}
