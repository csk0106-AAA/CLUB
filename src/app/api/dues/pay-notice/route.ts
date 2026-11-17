import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { duesAmount } from "@/lib/dues";
import { duesNow, isDuesHandler, periodLabel } from "@/lib/dues-ledger";
import { isGuest } from "@/lib/member-kind";
import { getPermGroups } from "@/lib/perms";
import { pushTo } from "@/lib/push";
import { getStore } from "@/lib/store";

const body = z.object({ sent: z.boolean() });

// 내 모임 회비 상태(게시판 모임회비 공지에서): 이번 기간, 낼 금액, 입금 확인·입금 알림 여부
export async function GET() {
  const g = await guard();
  if ("err" in g) return g.err;
  const s = await getStore();
  const me = (await s.list("Members")).find((m) => m.id === g.s.mid);
  const { dues, period } = await duesNow();
  const p = (await s.list("DuesPayments")).find((x) => x.period === period && x.memberId === g.s.mid);
  return NextResponse.json({
    period, periodLabel: periodLabel(period),
    amount: me && !isGuest(me.kind) ? duesAmount(dues, me) : "",
    paid: p?.paid === "true", paidAt: p?.paidAt ?? "", notice: p?.paid === "true" ? "" : p?.notice ?? "",
  });
}

// 회원이 모임회비 공지에서 "입금했어요(입금 확인 요청)"를 누르거나 취소한다. 실제 입금 확인은 관리자가 회비입금에서 한다.
export async function POST(req: Request) {
  const g = await guard();
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("요청을 확인해 주세요.");
  const s = await getStore();
  const members = await s.list("Members");
  const me = members.find((m) => m.id === g.s.mid);
  if (!me || isGuest(me.kind)) return bad("모임 회비를 내는 회원만 알릴 수 있어요.", 403);
  const { dues, period } = await duesNow();
  const amount = duesAmount(dues, me);
  if (!(Number(amount) > 0)) return bad("내야 할 모임 회비가 없어요.");
  const cur = (await s.list("DuesPayments")).find((x) => x.period === period && x.memberId === me.id);
  if (cur?.paid === "true") return bad("이미 입금이 확인됐어요.");
  const at = parsed.data.sent ? new Date().toISOString() : "";
  if (cur) await s.update("DuesPayments", cur.id, { notice: at });
  else await s.insert("DuesPayments", { period, memberId: me.id, amount: "", paid: "", paidAt: "", notice: at, memo: "", checkedBy: "" });
  // 회비를 관리하는 관리자에게 종·휴대폰 알림
  if (at) {
    try {
      const groups = await getPermGroups();
      const to = members.filter((m) => m.id !== me.id && isDuesHandler(m, groups)).map((m) => m.id);
      if (to.length) await pushTo(to, "alerts", me.id);
    } catch (e) {
      console.error("[push] 회비 입금 알림 실패", e);
    }
  }
  return NextResponse.json({ ok: true, period, periodLabel: periodLabel(period), notice: at });
}
