import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { kstYear } from "@/lib/dues";
import { duesNow, duesTargets, periodLabel } from "@/lib/dues-ledger";
import { getSetting, getStore, setSetting } from "@/lib/store";

export const dynamic = "force-dynamic";

// 관리자 › 회비입금 › 과거 내역 보기: 올해 전 연도들의 입금 합계, 엑셀 내려받기용 내역, 내려받기 기록.
//  GET            → { pastYears: [{ year, total, paid }], logs }
//  GET ?year=2025 → 그 해 엑셀 내용({ year, summary: [...회차], rows: [...회원별] })
//  POST { year, kind } → 내려받기 기록 남기기(누가·언제·어느 해, 회비입금 payments / 회비현황 ledger)
const LOG_KEY = "duesDownloads";
type Log = { year: string; by: string; byName: string; at: string; kind?: "payments" | "ledger" };

export async function GET(req: Request) {
  const g = await guard("group");
  if ("err" in g) return g.err;
  const s = await getStore();
  const [members, payments] = await Promise.all([s.list("Members"), s.list("DuesPayments")]);
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? "(지운 회원)";
  const thisYear = String(kstYear());
  const want = new URL(req.url).searchParams.get("year") ?? "";

  if (/^\d{4}$/.test(want)) {
    const { dues } = await duesNow();
    const inYear = payments.filter((p) => p.period.startsWith(want));
    const periods = [...new Set(inYear.map((p) => p.period))].sort();
    const targets = duesTargets(members, dues);
    const summary = periods.map((p) => {
      const got = inYear.filter((x) => x.period === p && x.paid === "true");
      return { period: p, label: periodLabel(p), paid: got.length, amount: got.reduce((n, x) => n + (Number(x.amount) || 0), 0) };
    });
    // 회원별: 그 해 기록이 있는 회원 + 지금 회비 대상 회원(기록이 없으면 미입금)
    const rows = periods.flatMap((p) => {
      const rec = inYear.filter((x) => x.period === p);
      const ids = [...new Set([...targets.map((t) => t.member.id), ...rec.map((x) => x.memberId)])];
      return ids.map((id) => {
        const x = rec.find((r) => r.memberId === id);
        const m = members.find((mm) => mm.id === id);
        const status = x?.paid === "true" ? "입금" : x?.notice ? "입금 알림(확인 전)" : "미입금";
        return {
          period: periodLabel(p), name: name(id), kind: m?.kind ?? "", position: m?.position ?? "",
          amount: x?.paid === "true" ? x.amount || "" : targets.find((t) => t.member.id === id)?.amount ?? "",
          status, paidAt: x?.paid === "true" ? (x.paidAt ?? "").slice(0, 10) : "", checkedBy: x?.checkedBy ? name(x.checkedBy) : "", memo: x?.memo ?? "",
        };
      });
    });
    return NextResponse.json({ year: want, summary, total: summary.reduce((n, r) => n + r.amount, 0), rows });
  }

  const years = [...new Set(payments.map((p) => p.period.slice(0, 4)))].filter((y) => /^\d{4}$/.test(y) && y < thisYear).sort((a, b) => b.localeCompare(a));
  const pastYears = years.map((y) => {
    const got = payments.filter((p) => p.period.startsWith(y) && p.paid === "true");
    return { year: y, paid: got.length, total: got.reduce((n, x) => n + (Number(x.amount) || 0), 0) };
  });
  const logs = (await getSetting<Log[]>(LOG_KEY, [])).slice(0, 50);
  return NextResponse.json({ thisYear, pastYears, logs });
}

const body = z.object({ year: z.string().regex(/^\d{4}$/), kind: z.enum(["payments", "ledger"]).default("payments") });

export async function POST(req: Request) {
  const g = await guard("group");
  if ("err" in g) return g.err;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad("연도를 확인해 주세요.");
  const logs = await getSetting<Log[]>(LOG_KEY, []);
  const log: Log = { year: p.data.year, by: g.s.mid, byName: g.s.name, at: new Date().toISOString(), kind: p.data.kind };
  await setSetting(LOG_KEY, [log, ...logs].slice(0, 200)); // 최근 200건까지 남긴다
  return NextResponse.json({ ok: true });
}
