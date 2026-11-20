import { NextResponse } from "next/server";
import { addAlerts } from "@/lib/member-alerts";
import { pushTo } from "@/lib/push";
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
  // 누적: 그 해의 회차(연회비는 한 번, 월회비는 달마다)별 입금 인원·입금액과 그 해 합계. 회차를 누르면 기간별로 간다.
  if (sp.get("view") === "total") {
    const s = await getStore();
    const [members, payments] = await Promise.all([s.list("Members"), s.list("DuesPayments")]);
    const wantYear = sp.get("year") ?? "";
    const year = /^\d{4}$/.test(wantYear) ? wantYear : cur.slice(0, 4);
    const paid = payments.filter((p) => p.paid === "true");
    // 회차: 지금 회비 방식의 회차 + 그 해에 입금 기록이 있는 회차(방식이 바뀐 경우)
    const base = dues.period === "monthly" ? Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`) : [year];
    const periods = [...new Set([...base, ...payments.filter((p) => p.period.startsWith(year)).map((p) => p.period)])].sort();
    const targets = duesTargets(members, dues).length;
    const rows = periods.map((p) => {
      const got = paid.filter((x) => x.period === p);
      return { period: p, label: periodLabel(p), paid: got.length, targets, amount: got.reduce((n, x) => n + (Number(x.amount) || 0), 0) };
    });
    const years = [...new Set([cur.slice(0, 4), ...payments.map((p) => p.period.slice(0, 4))])].filter((y) => /^\d{4}$/.test(y)).sort((a, b) => b.localeCompare(a));
    return NextResponse.json({ year, years, current: cur, duesPeriod: dues.period, rows, total: rows.reduce((n, r) => n + r.amount, 0) });
  }
  const want = sp.get("period") ?? "";
  const s = await getStore();
  const [members, payments] = await Promise.all([s.list("Members"), s.list("DuesPayments")]);
  // 처음 열 때(회차를 고르지 않음): 가장 최신 회차(지금 회차와 기록이 있는 회차 중 가장 늦은 것)
  const latest = [cur, ...payments.map((p) => p.period)].filter((p) => /^\d{4}(-\d{2})?$/.test(p)).sort((a, b) => b.localeCompare(a))[0] ?? cur;
  const period = /^\d{4}(-\d{2})?$/.test(want) ? want : latest;
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

// 회원 알림에서 열 곳: 가장 최근에 올린 모임 회비 공지(클럽 회비 글 제외). 없으면 홈
async function duesPostHref(): Promise<string> {
  const posts = await (await getStore()).list("Posts", { omit: ["body"] });
  const club = (p: { data?: string }) => { try { return String(JSON.parse(p.data || "{}").club ?? ""); } catch { return ""; } };
  const fee = posts.filter((p) => p.form === "fee" && !club(p)).sort((a, b) => (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""))[0];
  return fee ? `/board/${fee.id}` : "/board";
}

// 입금 확인·취소, 메모: 그 기간·회원의 입금 기록을 고친다(없으면 만든다)
const body = z.object({
  period: z.string().regex(/^\d{4}(-\d{2})?$/),
  memberId: z.string().min(1).max(64),
  paid: z.boolean().optional(),
  memo: z.string().trim().max(200).optional(),
  // reject: 회원이 보낸 입금 알림을 "입금 안 됨"으로 돌려보낸다(입금 확인 전). reason: 취소·돌려보낼 때 회원에게 보일 사유
  reject: z.boolean().optional(),
  reason: z.string().trim().max(200).optional(),
});

export async function POST(req: Request) {
  const g = await guard("group");
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("요청을 확인해 주세요.");
  const { period, memberId, paid, memo, reject, reason } = parsed.data;
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
    // 확인하든 취소하든 회원의 입금 알림은 끝난다(취소하면 회원이 다시 "입금했어요"를 누를 수 있다)
    patch.notice = "";
    if (paid) { patch.undoAt = ""; patch.undoReason = ""; }
    else if (cur?.paid === "true") { patch.undoAt = now; patch.undoReason = reason ?? ""; }
  }
  // 입금 알림 돌려보내기(입금 안 됨)
  if (reject && cur?.notice && cur.paid !== "true") { patch.notice = ""; patch.undoAt = now; patch.undoReason = reason ?? ""; }
  if (memo !== undefined) patch.memo = memo;
  if (cur) await s.update("DuesPayments", cur.id, patch);
  else await s.insert("DuesPayments", { period, memberId, amount: patch.amount ?? "", paid: "", paidAt: "", notice: "", memo: "", checkedBy: "", ...patch });
  // 회원에게 바로 알림(종·휴대폰)
  const label = periodLabel(period);
  const why = reason ? ` 사유: ${reason}` : "";
  const text = paid === true && cur?.paid !== "true" ? `${label} 모임 회비 입금이 확인됐어요.`
    : paid === false && cur?.paid === "true" ? `${label} 모임 회비 입금 확인이 취소됐어요.${why} 입금했다면 다시 “입금했어요”를 눌러 주세요.`
    : reject && cur?.notice && cur.paid !== "true" ? `${label} 모임 회비 입금이 확인되지 않았어요.${why} 입금했다면 다시 “입금했어요”를 눌러 주세요.`
    : "";
  if (text) {
    await addAlerts([memberId], { eventId: "", text, href: await duesPostHref() });
    await pushTo([memberId], "alerts").catch(() => undefined);
  }
  return NextResponse.json({ ok: true });
}
