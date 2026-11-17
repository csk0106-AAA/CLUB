import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { sortByNo } from "@/lib/member-order";
import { getStore } from "@/lib/store";

// 회원명단 순서 바꾸기(끌어서 옮기기): 보낸 순서대로 NO 를 1부터 다시 매긴다.
// 목록에 없던 회원(그 사이 다른 관리자가 추가한 회원)은 지금 순서대로 맨 뒤에 붙는다. 바뀐 회원만 저장한다.
const body = z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(2000) });

export async function PUT(req: Request) {
  const g = await guard("members");
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("순서를 확인해 주세요.");
  const s = await getStore();
  const all = sortByNo(await s.list("Members"));
  const byId = new Map(all.map((m) => [m.id, m]));
  const ids = [...new Set(parsed.data.ids)].filter((id) => byId.has(id));
  const order = [...ids, ...all.map((m) => m.id).filter((id) => !ids.includes(id))];
  let changed = 0;
  for (let i = 0; i < order.length; i++) {
    const m = byId.get(order[i]);
    if (m && m.no !== String(i + 1)) {
      await s.update("Members", m.id, { no: String(i + 1) });
      changed++;
    }
  }
  return NextResponse.json({ ok: true, changed });
}
