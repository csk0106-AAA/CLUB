import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { eventDuesSupports } from "@/lib/dues-ledger";
import { kstYear } from "@/lib/dues";
import { getStore } from "@/lib/store";
import { readSupports } from "@/lib/supports";

export const dynamic = "force-dynamic";

// 관리자 › 모임설정 › 회비내역: 연도별 장부(회비 입금 합계·기타 수입·지출)와 잔액.
//  회비 입금: 회비입금에서 확인한 금액(기간의 연도 기준)
//  기타 수입·지출: 여기서 적는 줄(+ 일정의 "모임회비 지원"은 지출로 자동)
//  잔액: 올해 = 올해 입금 + 올해 수입 - 올해 지출 / 전체 = 지금까지 모두 더한 값
export async function GET(req: Request) {
  const g = await guard("group");
  if ("err" in g) return g.err;
  const want = new URL(req.url).searchParams.get("year") ?? "";
  const year = /^\d{4}$/.test(want) ? want : String(kstYear());
  const s = await getStore();
  const [ledger, payments, events, members] = await Promise.all([s.list("DuesLedger"), s.list("DuesPayments"), s.list("Events"), s.list("Members")]);
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? "";
  const paid = payments.filter((p) => p.paid === "true");
  const auto = eventDuesSupports(events);
  const sum = (xs: { amount?: string | number }[]) => xs.reduce((n, x) => n + (Number(x.amount) || 0), 0);
  const inYear = (d: string) => (d ?? "").startsWith(year);

  const paidYear = sum(paid.filter((p) => inYear(p.period)));
  const inc = ledger.filter((l) => l.kind === "in");
  const out = ledger.filter((l) => l.kind === "out");
  const incomeYear = sum(inc.filter((l) => inYear(l.date)));
  const spendYear = sum(out.filter((l) => inYear(l.date))) + sum(auto.filter((a) => inYear(a.date)));
  const balanceAll = sum(paid) + sum(inc) - sum(out) - sum(auto);

  const rows = [
    ...ledger.filter((l) => inYear(l.date)).map((l) => ({
      id: l.id, date: l.date, kind: l.kind, item: l.item, amount: Number(l.amount) || 0, memo: l.memo ?? "", by: name(l.createdBy), auto: false, eventId: "",
    })),
    ...auto.filter((a) => inYear(a.date)).map((a) => ({ ...a, kind: "out", by: "", auto: true })),
  ].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const years = [...new Set([String(kstYear()), ...ledger.map((l) => l.date.slice(0, 4)), ...paid.map((p) => p.period.slice(0, 4)), ...auto.map((a) => a.date.slice(0, 4))])]
    .filter((y) => /^\d{4}$/.test(y)).sort((a, b) => b.localeCompare(a));
  // 장부에서 "일정 지원"으로 적을 때 고를 일정(최근 것 먼저, 클럽 일정 포함)
  const eventOptions = events
    .slice()
    .sort((a, b) => (b.startsAt || "").localeCompare(a.startsAt || ""))
    .map((e) => ({ id: e.id, name: e.name, date: (e.startsAt || "").slice(0, 10), club: e.club ?? "" }));
  return NextResponse.json({
    year, years,
    summary: { paid: paidYear, income: incomeYear, spend: spendYear, balanceYear: paidYear + incomeYear - spendYear, balanceAll },
    rows,
    events: eventOptions,
  });
}

// 장부에서 "일정 지원"으로 쓴 지출: 그 일정의 회비 탭 지원금(모임회비 지원)으로 넣는다(장부에는 일정 지원으로 자동 표시)
const eventSupport = z.object({
  eventId: z.string().min(1).max(64),
  item: z.string().trim().max(60).default(""),
  amount: z.number().int().min(1, "금액을 넣어 주세요.").max(10_000_000_000),
  memo: z.string().trim().max(200).default(""),
});

const entry = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 골라 주세요."),
  kind: z.enum(["in", "out"]),
  item: z.string().trim().min(1, "내용을 적어 주세요.").max(100),
  amount: z.number().int().min(1, "금액을 넣어 주세요.").max(10_000_000_000),
  memo: z.string().trim().max(300).default(""),
});

// 장부 줄 추가(eventId 가 있으면 그 일정의 모임회비 지원금으로)
export async function POST(req: Request) {
  const g = await guard("group");
  if ("err" in g) return g.err;
  const raw = await req.json().catch(() => null);
  if (raw && typeof raw.eventId === "string" && raw.eventId) {
    const ep = eventSupport.safeParse(raw);
    if (!ep.success) return bad(ep.error.issues.find((i) => /[가-힣]/.test(i.message))?.message ?? "입력값을 확인해 주세요.");
    const s = await getStore();
    const ev = (await s.list("Events")).find((e) => e.id === ep.data.eventId);
    if (!ev) return bad("일정을 찾을 수 없어요.", 404);
    const next = [...readSupports(ev.supports), { kind: "dues" as const, name: ep.data.item, amount: String(ep.data.amount), memo: ep.data.memo }];
    await s.update("Events", ev.id, { supports: JSON.stringify(next) });
    return NextResponse.json({ ok: true, event: ev.name });
  }
  const parsed = entry.safeParse(raw);
  if (!parsed.success) return bad(parsed.error.issues.find((i) => /[가-힣]/.test(i.message))?.message ?? "입력값을 확인해 주세요.");
  const d = parsed.data;
  const row = await (await getStore()).insert("DuesLedger", { ...d, amount: String(d.amount), createdBy: g.s.mid, createdAt: new Date().toISOString() });
  return NextResponse.json({ row });
}

// 장부 줄 고치기·지우기(id 로)
export async function PATCH(req: Request) {
  const g = await guard("group");
  if ("err" in g) return g.err;
  const raw = await req.json().catch(() => null);
  const id = typeof raw?.id === "string" ? raw.id : "";
  const parsed = entry.safeParse(raw);
  if (!id || !parsed.success) return bad(parsed.success ? "고칠 줄을 찾을 수 없어요." : parsed.error.issues.find((i) => /[가-힣]/.test(i.message))?.message ?? "입력값을 확인해 주세요.");
  const s = await getStore();
  if (!(await s.list("DuesLedger")).some((l) => l.id === id)) return bad("고칠 줄을 찾을 수 없어요.", 404);
  await s.update("DuesLedger", id, { ...parsed.data, amount: String(parsed.data.amount) });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const g = await guard("group");
  if ("err" in g) return g.err;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const s = await getStore();
  // 일정 지원 줄(ev-일정id-번호): 그 일정의 모임회비 지원금에서 뺀다
  const m = /^ev-(.+)-(\d+)$/.exec(id);
  if (m) {
    const ev = (await s.list("Events")).find((e) => e.id === m[1]);
    if (!ev) return bad("일정을 찾을 수 없어요.", 404);
    const all = readSupports(ev.supports);
    const dues = all.map((x, i) => ({ x, i })).filter(({ x }) => x.kind === "dues" && Number(x.amount) > 0);
    const target = dues[Number(m[2])];
    if (!target) return bad("지울 지원금을 찾을 수 없어요. 화면을 새로 고쳐 주세요.", 404);
    await s.update("Events", ev.id, { supports: JSON.stringify(all.filter((_, i) => i !== target.i)) });
    return NextResponse.json({ ok: true });
  }
  if (!(await s.remove("DuesLedger", id))) return bad("지울 줄을 찾을 수 없어요.", 404);
  return NextResponse.json({ ok: true });
}
