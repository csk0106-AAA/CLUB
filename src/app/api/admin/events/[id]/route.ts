import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { feeRules, GENERAL_POSITION, memberFee, readRules } from "@/lib/fee";
import { audienceInput } from "@/lib/audience";
import { getLists } from "@/lib/lists";
import { notifyEvent } from "@/lib/push";
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
  // 직책: "회원 구분" 화면의 직책 목록 + 명단에만 있는 직책 + "일반회원"(직책이 없는 회원)
  const listed = (await getLists()).positions;
  const positions = [
    ...new Set([
      ...listed.filter((p) => p !== GENERAL_POSITION),
      ...[...new Set(members.map((m) => m.position?.trim() ?? "").filter((p) => p && p !== "-" && p !== GENERAL_POSITION && !listed.includes(p)))].sort((a, b) => a.localeCompare(b, "ko")),
      GENERAL_POSITION,
    ]),
  ];
  return NextResponse.json({ event: { ...event, feeRules: readRules(event.feeRules) }, rows, options: { kinds, positions } });
}

const patch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  startsAt: z.string().max(30).optional(),
  endsAt: z.string().max(30).optional(),
  place: z.string().max(120).optional(),
  booking: z.string().max(2000).optional(), // 안내(여러 줄)
  status: z.string().max(30).optional(),
  published: z.boolean().optional(),
  fee: z.string().regex(/^\d{0,9}$/).optional(),
  feeDeadline: z.string().max(30).optional(),
  account: z.string().max(120).optional(),
  accountHolder: z.string().max(60).optional(),
  feeRules: feeRules.optional(), // 조건별 회비
  audience: audienceInput.optional(), // 공개 대상(비우면 전체 회원)
});

export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guard(["events", "fees"]);
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요. 회비는 숫자만 넣어 주세요.");
  const { published, feeRules: rules, audience, ...rest } = parsed.data;
  const s = await getStore();
  const before = (await s.list("Events")).find((e) => e.id === id);
  if (!before) return bad("행사를 찾을 수 없어요.", 404);
  const row = await s.update("Events", id, {
    ...rest,
    ...(rules === undefined ? {} : { feeRules: JSON.stringify(rules) }),
    ...(published === undefined ? {} : { published: String(published) }),
    ...(audience === undefined ? {} : { audience: audience.mode === "all" ? "" : JSON.stringify(audience) }),
  });
  if (!row) return bad("행사를 찾을 수 없어요.", 404);
  // 회원에게 공개된 행사가 새로 공개되거나 내용이 바뀌면 알림(배지·휴대폰)
  const changed = Object.keys(parsed.data).some((k) => k !== "status");
  if (row.published === "true" && changed) {
    await notifyEvent(id, before.published === "true" ? "update" : "new");
  }
  return NextResponse.json({ event: row });
}
