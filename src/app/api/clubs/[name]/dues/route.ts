import { NextResponse } from "next/server";
import { bad } from "@/lib/api";
import { zodMessage } from "@/lib/board";
import { duesInput, duesSummary, duplicateRule, writeClubDues } from "@/lib/dues";
import { GENERAL_POSITION } from "@/lib/fee";
import { clubLabel } from "@/lib/club-label";
import { getLists } from "@/lib/lists";
import { clubAdmin, clubMemberIds, headRole, postsOf } from "@/lib/published";
import { clubDuesGuard, currentClubDues, type Ctx } from "./_guard";

export const dynamic = "force-dynamic";

// 소모임 회비 설정과 올린 소모임 회비 글 목록. 관리자 또는 그 소모임 회장(대표)만(_guard.ts).
export async function GET(_req: Request, ctx: Ctx) {
  const g = await clubDuesGuard(ctx);
  if ("err" in g) return g.err;
  const [dues, lists, pub, memberIds, role] = await Promise.all([currentClubDues(g.club), getLists(), postsOf({ kind: "club", club: g.club }), clubMemberIds(g.club), headRole()]);
  // 소모임 회비의 조건 "직책"은 소모임 직책(회원 구분 › 소모임 직책). 일반회원 = 이 소모임에서 직책이 없는 회원.
  // 예전에 모임 직책으로 넣은 줄도 고를 수 있게 지금 줄의 값은 화면에서 함께 보여 준다.
  const positions = [...new Set([...lists.clubRoles.filter((p) => p !== GENERAL_POSITION), GENERAL_POSITION])];
  return NextResponse.json({
    club: g.club,
    dues,
    summary: duesSummary(dues),
    options: { positions, kinds: lists.memberKinds.map((k) => k.value) },
    posts: pub.posts,
    linked: pub.linked,
    memberIds,
    headRole: role,
    admin: clubAdmin(g.me.perms),
    template: { body: `${clubLabel(g.club)} 회비를 안내해 드려요. 아래 ‘내 회비’를 확인하고 기한까지 보내 주세요. 입금자명은 본인 이름으로 부탁드려요.` },
  });
}

export async function PUT(req: Request, ctx: Ctx) {
  const g = await clubDuesGuard(ctx);
  if ("err" in g) return g.err;
  const parsed = duesInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(zodMessage(parsed.error, "입력값을 확인해 주세요. 금액은 숫자만 넣어 주세요."));
  const d = parsed.data;
  const dup = duplicateRule(d.rules);
  if (dup) return bad(`“${dup}” 조건 줄이 두 번 들어 있어요.`);
  if (d.period === "annual" && d.periodStart && d.periodEnd && d.periodStart > d.periodEnd) return bad("입금 기간의 끝 날짜가 시작 날짜보다 빨라요.");
  await writeClubDues(g.club, d);
  return NextResponse.json({ ok: true, dues: d, summary: duesSummary(d) });
}
