import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { duesAccount, duesAmount } from "@/lib/dues";
import { duesNow, duesTargets, periodLabel } from "@/lib/dues-ledger";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 관리자 › 모임설정 › 회비입금: 기간별 회원 입금 현황(낼 금액·입금·입금 알림)
export async function GET(req: Request) {
  const g = await guard("group");
  if ("err" in g) return g.err;
  const { dues, period: cur } = await duesNow();
  const sp = new URL(req.url).searchParams;
  // 누적 현황: 회원 × 기간(연회비는 기록이 있는 해부터 올해까지 최대 6년, 월회비는 최근 12개월)
  if (sp.get("view") === "grid") {
    const s = await getStore();
    const [members, payments] = await Promise.all([s.list("Members"), s.list("DuesPayments")]);
    let periods: string[];
    if (dues.period === "monthly") {
      const [y, m] = cur.split("-").map(Number);
      periods = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(Date.UTC(y, m - 1 - i, 1));
        return d.toISOString().slice(0, 7);
      });
    } else {
      const years = payments.map((p) => Number(p.period.slice(0, 4))).filter((n) => n > 2000);
      const from = Math.max(Math.min(Number(cur), ...years), Number(cur) - 5);
      periods = Array.from({ length: Number(cur) - from + 1 }, (_, i) => String(Number(cur) - i));
    }
    const targets = duesTargets(members, dues);
    const ids = new Set(targets.map((t) => t.member.id));
    const extra = members.filter((m) => !ids.has(m.id) && payments.some((p) => p.memberId === m.id && periods.includes(p.period) && (p.paid === "true" || p.notice)));
    const rows = [...targets.map((t) => ({ m: t.member, amount: t.amount, target: true })), ...extra.map((m) => ({ m, amount: "", target: false }))]
      .map(({ m, amount, target }) => ({
        memberId: m.id, name: m.name, kind: m.kind ?? "", amount, target,
        cells: periods.map((p) => {
          const x = payments.find((q) => q.period === p && q.memberId === m.id);
          return { period: p, status: x?.paid === "true" ? "paid" : x?.notice ? "notice" : "none", amount: x?.paid === "true" ? x.amount : "", at: x?.paid === "true" ? x.paidAt : x?.notice ?? "" };
        }),
      }));
    return NextResponse.json({ periods: periods.map((p) => ({ value: p, label: periodLabel(p) })), current: cur, duesPeriod: dues.period, rows });
  }
  const want = sp.get("period") ?? "";
  const period = /^\d{4}(-\d{2})?$/.test(want) ? want : cur;
  const s = await getStore();
  const [members, payments] = await Promise.all([s.list("Members"), s.list("DuesPayments")]);
  const mine = payments.filter((p) => p.period === period);
  const name = (id: string) => members.find((m) => m.id === id)?.name ?? "(지운 회원)";
  const targets = duesTargets(members, dues);
  const ids = new Set(targets.map((t) => t.member.id));
  const rows = [
    ...targets.map(({ member: m, amount }) => {
      const p = mine.find((x) => x.memberId === m.id);
      return {
        memberId: m.id, name: m.name, kind: m.kind ?? "", position: m.position ?? "",
        amount: p?.paid === "true" ? p.amount || amount : amount,
        paid: p?.paid === "true", paidAt: p?.paidAt ?? "", notice: p?.paid === "true" ? "" : p?.notice ?? "", memo: p?.memo ?? "",
        checkedBy: p?.checkedBy ? name(p.checkedBy) : "", target: true,
      };
    }),
    // 지금은 대상이 아니지만 이 기간에 입금 기록이 있는 회원(회비가 바뀌었거나 구분이 바뀐 경우)
    ...mine.filter((p) => !ids.has(p.memberId) && (p.paid === "true" || p.notice)).map((p) => ({
      memberId: p.memberId, name: name(p.memberId), kind: members.find((m) => m.id === p.memberId)?.kind ?? "", position: "",
      amount: p.amount || "0", paid: p.paid === "true", paidAt: p.paidAt ?? "", notice: p.paid === "true" ? "" : p.notice ?? "", memo: p.memo ?? "",
      checkedBy: p.checkedBy ? name(p.checkedBy) : "", target: false,
    })),
  ];
  // 고를 수 있는 기간: 지금 기간 + 기록이 있는 기간(최근 것 먼저)
  const periods = [...new Set([cur, ...payments.map((p) => p.period)])].filter(Boolean).sort((a, b) => b.localeCompare(a));
  return NextResponse.json({
    period, periodLabel: periodLabel(period), current: cur,
    periods: periods.map((p) => ({ value: p, label: periodLabel(p) })),
    duesPeriod: dues.period, account: duesAccount(dues), holder: dues.holder,
    rows,
  });
}

// 입금 확인·취소, 메모: 그 기간·회원의 입금 기록을 고친다(없으면 만든다)
const body = z.object({
  period: z.string().regex(/^\d{4}(-\d{2})?$/),
  memberId: z.string().min(1).max(64),
  paid: z.boolean().optional(),
  memo: z.string().trim().max(200).optional(),
});

export async function POST(req: Request) {
  const g = await guard("group");
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("요청을 확인해 주세요.");
  const { period, memberId, paid, memo } = parsed.data;
  const s = await getStore();
  const m = (await s.list("Members")).find((x) => x.id === memberId);
  if (!m) return bad("회원을 찾을 수 없어요.", 404);
  const { dues } = await duesNow();
  const cur = (await s.list("DuesPayments")).find((p) => p.period === period && p.memberId === memberId);
  const now = new Date().toISOString();
  const patch: Record<string, string> = {};
  if (paid !== undefined) {
    patch.paid = paid ? "true" : "";
    patch.paidAt = paid ? now : "";
    patch.checkedBy = paid ? g.s.mid : "";
    // 확인할 때의 금액을 남긴다(나중에 회비 설정이 바뀌어도 장부가 그대로)
    if (paid) patch.amount = cur?.amount && cur.paid === "true" ? cur.amount : duesAmount(dues, m) || "0";
    if (paid) patch.notice = "";
  }
  if (memo !== undefined) patch.memo = memo;
  if (cur) await s.update("DuesPayments", cur.id, patch);
  else await s.insert("DuesPayments", { period, memberId, amount: patch.amount ?? "", paid: "", paidAt: "", notice: "", memo: "", checkedBy: "", ...patch });
  return NextResponse.json({ ok: true });
}
