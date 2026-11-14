import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { duesAmount, duesInput, duesSummary, readDues } from "@/lib/dues";
import { GENERAL_POSITION } from "@/lib/fee";
import { getLists } from "@/lib/lists";
import { getStore, setSetting } from "@/lib/store";

export const dynamic = "force-dynamic";

// 모임회비 설정과 선택지(직책·회원구분), 회비별 회원 수
export async function GET() {
  const g = await guard(["fees", "members"]);
  if ("err" in g) return g.err;
  const [dues, lists, members] = await Promise.all([readDues(), getLists(), (await getStore()).list("Members")]);
  const positions = [...new Set([...lists.positions.filter((p) => p !== GENERAL_POSITION), GENERAL_POSITION])];
  const active = members.filter((m) => m.kind !== "회원대기");
  const dist = new Map<string, number>();
  for (const m of active) {
    const a = duesAmount(dues, m);
    dist.set(a, (dist.get(a) ?? 0) + 1);
  }
  return NextResponse.json({
    dues,
    summary: duesSummary(dues),
    options: { positions, kinds: lists.memberKinds.map((k) => k.value) },
    dist: [...dist].map(([amount, count]) => ({ amount, count })).sort((a, b) => Number(b.amount) - Number(a.amount)),
  });
}

export async function PUT(req: Request) {
  const g = await guard(["fees", "members"]);
  if ("err" in g) return g.err;
  const parsed = duesInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요. 금액은 숫자만 넣어 주세요.");
  const d = parsed.data;
  const dupPos = d.rules.map((r) => r.position).find((p, i, a) => a.indexOf(p) !== i);
  if (dupPos) return bad(`“${dupPos}” 직책 회비가 두 번 들어 있어요.`);
  const dupKind = d.kindRules.map((r) => r.kind).find((p, i, a) => a.indexOf(p) !== i);
  if (dupKind) return bad(`“${dupKind}” 회원구분 회비가 두 번 들어 있어요.`);
  await setSetting("dues", d);
  return NextResponse.json({ ok: true, dues: d, summary: duesSummary(d) });
}
