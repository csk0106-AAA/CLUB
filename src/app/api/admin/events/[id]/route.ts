import { NextResponse } from "next/server";
import { readVisibility, VIS_KEYS } from "@/lib/event-visibility";
import { MAX_PHOTO_LIMIT } from "@/lib/event-photos";
import { z } from "zod";
import { bad, canDeleteEvent, guardEv } from "@/lib/api";
import { deleteEventCascade } from "@/lib/event-delete";
import { feeRules, GENERAL_POSITION, memberFee, readRules } from "@/lib/fee";
import { audienceInput, inClubOrObserver, readObservers } from "@/lib/audience";
import { clubLeaders, readAllClubInfo } from "@/lib/clubs";
import { clubPayAccount, duesAccount, readDues } from "@/lib/dues";
import { getLists, memberClubs } from "@/lib/lists";
import { notifyEvent } from "@/lib/push";
import { fixLegacyTypes } from "@/lib/event-migrate";
import { isGuest, isWithdrawn } from "@/lib/member-kind";
import { isAttend, reqLabel } from "@/lib/club-requests";
import { readSupports, supportsInput } from "@/lib/supports";
import { getSetting, getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// 일정 상세: 개요, 회원별 신청·회비 현황(미응답 회원 포함)
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, "events");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const s = await getStore();
  const [events, members, applies] = await Promise.all([
    s.list("Events"),
    s.list("Members"),
    s.list("EventApplies"),
  ]);
  await fixLegacyTypes(events);
  const event = events.find((e) => e.id === id);
  if (!event) return bad("일정을 찾을 수 없어요.", 404);

  // 클럽 일정: 그 클럽 회원 + 참관자만 보여 준다(참관자·회장 표시).
  const club = (event.club ?? "").trim();
  const observers = readObservers(event.observers);
  // 탈퇴회원도 이 일정에 참석 신청한 기록이 있으면 남겨 보여 준다(회원구분에 "탈퇴회원")
  const rows = members
    .filter((m) => inClubOrObserver(event, m) || (isWithdrawn(m.kind) && applies.some((x) => x.eventId === id && x.memberId === m.id)))
    .map((m) => {
      const seat = club ? memberClubs(m).find((c) => c.name === club) : undefined;
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
        // 관리자가 대신 체크한 경우: 체크한 사람 이름·시각
        checkedBy: a?.checkedBy ? members.find((x) => x.id === a.checkedBy)?.name ?? "관리자" : "",
        checkedAt: a?.checkedAt ?? "",
        // 회비 돌려주기: "wait" 송금대기 / "done" 송금완료(lib/refund.ts)
        refund: a?.refund ?? "", refundAmount: a?.refundAmount ?? "", refundSince: a?.refundSince ?? "", refundDoneAt: a?.refundDoneAt ?? "",
        // 관리자 승인 후 참석: "참석" 이면 승인 대기(reqDays 고른 날짜, reqAt 신청 시각), reqResult "declined" 반려됨
        req: a?.req ?? "", reqDays: a?.reqDays ?? "", reqAt: a?.reqAt ?? "", reqResult: a?.reqResult ?? "",
        fee: mf.known ? mf.amount : "",
        feePending: !mf.known,
        clubRole: seat?.role ?? "", // 클럽 직책(회장 등)
        observer: !!club && !seat && observers.includes(m.id),
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
  // 클럽 선택지와 미리 채울 계좌: 클럽별 계좌·직책자, 모임회비관리 계좌
  const [info, dues] = await Promise.all([readAllClubInfo(), readDues()]);
  const lists = await getLists();
  // 클럽 계좌: 클럽관리 › 회비관리의 계좌(없으면 예전 기본 정보의 계좌)
  const clubs = await Promise.all(lists.clubs.map(async (name) => {
    const p = await clubPayAccount(name, info[name]);
    return { name, account: p.account, holder: p.holder, leaders: clubLeaders(members, name).map((l) => ({ name: l.name, role: l.role })) };
  }));
  // 필수 승인: 대기회원·참관회원의 참관 + 참석 신청, 다른 클럽 회원의 가입·참관 + 참석 신청(처리 대기 중인 것)
  const waiting = (await s.list("ClubRequests"))
    .filter((r) => r.eventId === id && r.status === "pending" && isAttend(r))
    .map((r) => ({ id: r.id, memberId: r.memberId, name: members.find((m) => m.id === r.memberId)?.name ?? "회원", kind: r.kind, label: reqLabel(r), message: r.message ?? "", createdAt: r.createdAt ?? "", guest: isGuest(members.find((m) => m.id === r.memberId)?.kind) }));
  return NextResponse.json({
    event: { ...event, club, observers, feeRules: readRules(event.feeRules), supports: readSupports(event.supports) },
    canDelete: canDeleteEvent(g.s, event),
    rows,
    waiting,
    options: { kinds, positions, clubs, dues: { account: duesAccount(dues), holder: dues.holder } },
  });
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
  club: z.string().trim().max(40).optional(), // 클럽 일정의 클럽(""= 없음)
  pinned: z.boolean().optional(), // 회원 일정 목록 맨 위에 고정
  showPrep: z.boolean().optional(), // 준비목록을 회원에게 보이기
  showCosts: z.boolean().optional(), // 비용을 회원에게 보이기
  supports: supportsInput.optional(), // 지원금(연·월회비 지원, 회원 지원)
  photoLimit: z.string().regex(/^(\d{1,4})?$/).optional(), // 사진첩 최대 장수("" = 참석 인원 × 10장 × 일수)
  approval: z.enum(["", "admin"]).optional(), // 참석 확정 방식("" 바로 참석 / admin 관리자 승인 후, lib/attend-approval.ts)
  visibility: z.record(z.string(), z.boolean()).optional(), // 미응답·불참 회원에게 공개할 항목(lib/event-visibility.ts)
});

export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, "events");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요. 회비는 숫자만 넣어 주세요.");
  const { published, pinned, feeRules: rules, audience, showPrep, showCosts, supports, photoLimit, visibility, ...rest } = parsed.data;
  if (photoLimit && (Number(photoLimit) < 1 || Number(photoLimit) > MAX_PHOTO_LIMIT)) return bad(`사진 최대 장수는 1~${MAX_PHOTO_LIMIT}장으로 정해 주세요.`);
  const s = await getStore();
  const before = (await s.list("Events")).find((e) => e.id === id);
  if (!before) return bad("일정을 찾을 수 없어요.", 404);
  if (rest.club !== undefined) {
    // 클럽이 정해진 일정은 유형(정기모임·워크숍 등)과 상관없이 클럽을 유지한다
    if (before.type !== "클럽" && !(before.club ?? "").trim()) rest.club = "";
    else if (rest.club && rest.club !== (before.club ?? "") && !(await getLists()).clubs.includes(rest.club)) return bad("클럽을 목록에서 골라 주세요.");
  }
  const row = await s.update("Events", id, {
    ...rest,
    ...(rules === undefined ? {} : { feeRules: JSON.stringify(rules) }),
    // 상태값은 공개 여부와 같은 뜻: 공개 / 초안
    ...(published === undefined ? {} : { published: String(published), status: published ? "공개" : "초안" }),
    ...(pinned === undefined ? {} : { pinned: String(pinned) }),
    ...(showPrep === undefined ? {} : { showPrep: showPrep ? "true" : "" }),
    ...(showCosts === undefined ? {} : { showCosts: showCosts ? "true" : "" }),
    // 보낸 항목만 바꾸고 나머지는 지금 값(없으면 유형 기본값) 그대로
    ...(visibility === undefined ? {} : { visibility: JSON.stringify(((cur) => Object.fromEntries(VIS_KEYS.map((k) => [k, typeof visibility[k] === "boolean" ? visibility[k] : cur[k]])))(readVisibility(before))) }),
    ...(supports === undefined ? {} : { supports: JSON.stringify(supports) }),
    // 사진 최대 장수를 바꿔 저장하면 회원들의 장수 늘리기 요청을 처리한 것으로 비운다(처리할 일에서 사라짐)
    ...(photoLimit === undefined || photoLimit === (before.photoLimit ?? "") ? {} : { photoLimit: photoLimit ? String(Number(photoLimit)) : "", photoReqs: "" }),
    // 공개 대상을 다시 저장하면 신규 회원 확인도 한 것으로 본다(lib/new-joiners.ts)
    ...(audience === undefined ? {} : { audience: audience.mode === "all" ? "" : JSON.stringify(audience), audSeenAt: new Date().toISOString() }),
  });
  if (!row) return bad("일정을 찾을 수 없어요.", 404);
  // 회원에게 공개된 일정이 새로 공개되거나 내용이 바뀌면 알림(배지·휴대폰)
  // (진행 상태·맨 위 고정만 바꾼 것은 알리지 않는다)
  // (회원에게 보이기 설정만 바꾼 것도 알리지 않는다)
  const changed = Object.keys(parsed.data).some((k) => !["status", "pinned", "showPrep", "showCosts", "supports", "photoLimit", "visibility"].includes(k));
  if (row.published === "true" && changed) {
    await notifyEvent(id, before.published === "true" ? "update" : "new");
  }
  return NextResponse.json({ event: row });
}

// 일정 삭제: 일정관리 권한자, 클럽관리 권한자(클럽 일정), 만든 사람만. 딸린 기록도 함께 지운다.
export async function DELETE(_req: Request, ctx: Ctx) {
  const g = await guardEv(ctx, "events");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const ev = (await (await getStore()).list("Events")).find((e) => e.id === id);
  if (!ev) return bad("일정을 찾을 수 없어요.", 404);
  if (!canDeleteEvent(g.s, ev)) return bad("일정은 일정관리 권한자나 만든 사람만 지울 수 있어요.", 403);
  await deleteEventCascade(id);
  return NextResponse.json({ ok: true });
}
