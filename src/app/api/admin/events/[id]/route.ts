import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { feeRules, memberFee, readRules } from "@/lib/fee";
import { getSetting, getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// 행사 상세: 개요, 회원별 신청·회비 현황(미응답 회원 포함)
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard(["events", "fees"]);
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const s = await getStore();
  const [events, members, applies] = await Promise.all([
    s.list("Events"),
    s.list("Members"),
    s.list("EventApplies"),
  ]);
  const event = events.find((e) => e.id === id);
  if (!event) return bad("행사를 찾을 수 없어요.", 404);

  const rows = members
    .filter((m) => m.kind !== "회원대기")
    .map((m) => {
      const a = applies.find((x) => x.eventId === id && x.memberId === m.id);
      // 이 회원이 낼 회비(참석일·회원구분·직책 조건 반영)
      const mf = memberFee(event, { kind: m.kind, position: m.position }, a);
      return {
        memberId: m.id,
        name: m.name,
        kind: m.kind,
        position: m.position,
        answer: a?.answer ?? "",
        days: a?.days ?? "",
        paid: a?.paid === "true",
        paidAt: a?.paidAt ?? "",
        memo: a?.memo ?? "",
        payNotice: a?.payNotice ?? "",
        fee: mf.known ? mf.amount : "",
        feePending: !mf.known,
      };
    });
  // 조건별 회비 선택지: 회원구분(설정 값), 직책(명단에 있는 값)
  const kinds = (await getSetting<{ value: string }[]>("memberKinds", [])).map((k) => k.value);
  const positions = [...new Set(members.map((m) => m.position).filter((p) => p && p !== "-"))].sort((a, b) => a.localeCompare(b, "ko"));
  return NextResponse.json({ event: { ...event, feeRules: readRules(event.feeRules) }, rows, options: { kinds, positions } });
}

const patch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  startsAt: z.string().max(30).optional(),
  endsAt: z.string().max(30).optional(),
  place: z.string().max(120).optional(),
  booking: z.string().max(300).optional(),
  status: z.string().max(30).optional(),
  published: z.boolean().optional(),
  fee: z.string().regex(/^\d{0,9}$/).optional(),
  feeDeadline: z.string().max(30).optional(),
  account: z.string().max(120).optional(),
  accountHolder: z.string().max(60).optional(),
  feeRules: feeRules.optional(), // 조건별 회비
});

export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guard(["events", "fees"]);
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요. 회비는 숫자만 넣어 주세요.");
  const { published, feeRules: rules, ...rest } = parsed.data;
  const s = await getStore();
  const row = await s.update("Events", id, {
    ...rest,
    ...(rules === undefined ? {} : { feeRules: JSON.stringify(rules) }),
    ...(published === undefined ? {} : { published: String(published) }),
  });
  if (!row) return bad("행사를 찾을 수 없어요.", 404);
  return NextResponse.json({ event: row });
}
