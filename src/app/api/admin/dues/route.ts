import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { DEFAULT_TEMPLATES, zodMessage } from "@/lib/board";
import { duesAmount, duesInput, duesSummary, duplicateRule, readDues } from "@/lib/dues";
import { GENERAL_POSITION } from "@/lib/fee";
import { getLists } from "@/lib/lists";
import { postsOf } from "@/lib/published";
import { isGuest } from "@/lib/member-kind";
import { getStore, setSetting } from "@/lib/store";

export const dynamic = "force-dynamic";

// 모임 회비(연회비·월회비) 설정, 선택지(직책·회원구분), 금액별 회원 수, 올린 회비 글 목록. 권한: 회비(fees) 또는 모든 권한.
export async function GET() {
  const g = await guard("fees");
  if ("err" in g) return g.err;
  const [dues, lists, members, pub] = await Promise.all([readDues(), getLists(), (await getStore()).list("Members"), postsOf({ kind: "dues" })]);
  const positions = [...new Set([...lists.positions.filter((p) => p !== GENERAL_POSITION), GENERAL_POSITION])];
  const active = members.filter((m) => !isGuest(m.kind));
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
    posts: pub.posts,
    linked: pub.linked,
    template: { body: DEFAULT_TEMPLATES.fee.body },
  });
}

export async function PUT(req: Request) {
  const g = await guard("fees");
  if ("err" in g) return g.err;
  const parsed = duesInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(zodMessage(parsed.error, "입력값을 확인해 주세요. 금액은 숫자만 넣어 주세요."));
  const d = parsed.data;
  const dup = duplicateRule(d.rules);
  if (dup) return bad(`“${dup}” 조건 줄이 두 번 들어 있어요.`);
  if (d.period === "annual" && d.periodStart && d.periodEnd && d.periodStart > d.periodEnd) return bad("입금 기간의 끝 날짜가 시작 날짜보다 빨라요.");
  await setSetting("dues", d);
  return NextResponse.json({ ok: true, dues: d, summary: duesSummary(d) });
}
