import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { getLists } from "@/lib/lists";
import { checkPermChange, getPermGroups, isAllNow } from "@/lib/perms";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 관리자 › 회원관리 › 조직도: 한 직책을 맡을 회원을 여러 명 한 번에 정한다(회원 명단의 "직책" 값을 바꾼다).
//  - 고른 회원 → 이 직책. (다른 직책이던 회원은 이 직책으로 옮겨진다. 회원 한 명은 직책 하나)
//  - 이 직책이었는데 빠진 회원 → "일반회원"(목록에 있으면) 아니면 빈 값.
//  - 직책이 바뀌어 권한이 달라지면 "모든 권한" 관리자만 할 수 있다(회원 수정과 같은 확인).
const body = z.object({ position: z.string().trim().min(1).max(40), memberIds: z.array(z.string().min(1).max(80)).max(200) });

export async function POST(req: Request) {
  const g = await guard("members");
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요.");
  const { position, memberIds } = parsed.data;

  const lists = await getLists();
  if (!lists.positions.includes(position)) return bad("회원 구분의 직책 목록에 없는 직책이에요.");
  const none = lists.positions.includes("일반회원") ? "일반회원" : "";
  if (position === none) return bad("일반회원은 조직도에서 정하지 않아요.");

  const s = await getStore();
  const all = await s.list("Members");
  const pick = new Set(memberIds);
  if ([...pick].some((id) => !all.some((m) => m.id === id))) return bad("없는 회원이 들어 있어요. 화면을 새로 고쳐 주세요.");

  const changes = new Map<string, string>();
  for (const m of all) {
    if (pick.has(m.id) && m.position !== position) changes.set(m.id, position);
    else if (!pick.has(m.id) && m.position === position) changes.set(m.id, none);
  }
  if (changes.size === 0) return NextResponse.json({ ok: true, changed: 0 });

  const groups = await getPermGroups();
  const after = all.map((m) => (changes.has(m.id) ? { ...m, position: changes.get(m.id)! } : m));
  const err = checkPermChange(all, groups, after, groups, await isAllNow(g.s.mid));
  if (err) return bad(err[0], err[1]);

  for (const [id, p] of changes) await s.update("Members", id, { position: p });
  return NextResponse.json({ ok: true, changed: changes.size });
}
