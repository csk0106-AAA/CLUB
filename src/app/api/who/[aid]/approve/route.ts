import { NextResponse } from "next/server";
import { notifyNewWhoIntro } from "@/lib/who-notify";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { findIdentity, termsFrom } from "@/lib/identity";
import { notifyProfilePush } from "@/lib/push";
import { getStore } from "@/lib/store";
import { inGame, loadWho, myProfile, myTruthLies, writeClosed, writeGate } from "@/lib/who";

type Ctx = { params: Promise<{ aid: string }> };

const body = z.object({
  introMd: z.string().trim().min(20).max(8000),
  // 2진실 1거짓은 이 활동에 참석하는 분만 필요하다(불참하는 분은 프로필 북용 소개만 낸다).
  statements: z.array(z.string().trim().min(2).max(300)).length(3).optional(),
  lieIndex: z.number().int().min(0).max(2).optional(),
});

// "최종 배포하겠습니다": 승인한 결과만 공개 상태로 저장된다.
// 서버가 한 번 더 신원 정보(이름, 회사명, 직함, 출신 학교)가 없는지 검사한다.
export async function POST(req: Request, ctx: Ctx) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;
  const closed = writeClosed(w) ?? (await writeGate(w, g.s.mid));
  if (closed) return closed;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("소개 글은 20자 이상, 2진실 1거짓은 문장 3개와 거짓 번호가 필요해요.");
  const d = parsed.data;

  const s = await getStore();
  const profile = await myProfile(g.s.mid);
  if (!profile) return bad("소개 글을 먼저 만들어 주세요.");
  // 게임 참여(별칭으로 가려짐)일 때만 별칭이 필요하고 신원 정보를 검사한다. 프로필 북 작성은 실명으로 공개된다.
  const inAct = await inGame(w, g.s.mid);
  if (inAct && !profile.alias) return bad("별칭을 먼저 정해 주세요.");
  // 2진실 1거짓은 사전 단계에 그 단계가 있는 활동만
  const tlOn = inAct && w.cfg.preEvent.steps.includes("truth_lies");
  if (tlOn && (!d.statements || d.lieIndex === undefined)) return bad("2진실 1거짓은 문장 3개와 거짓 번호가 필요해요.");

  const terms = termsFrom(await s.list("Members"));
  const hitsIntro = inAct ? findIdentity(d.introMd, terms) : [];
  const hitsTl = inAct && d.statements ? findIdentity(d.statements.join(" "), terms) : [];
  if (hitsIntro.length || hitsTl.length) {
    const list = [...new Set([...hitsIntro, ...hitsTl])].join(", ");
    return NextResponse.json({ error: `신원이 드러나는 말이 있어 배포할 수 없어요: ${list}. 지우거나 일반적인 표현으로 바꿔 주세요.`, hits: [...hitsIntro, ...hitsTl] }, { status: 422 });
  }

  const now = new Date().toISOString();
  // firstApprovedAt: 처음 공개한 시각(프로필 북의 NEW / UP 구분). 이미 있으면 그대로,
  // 이 열이 생기기 전에 공개한 적이 있으면(approvedAt) 그 시각으로 채운다(다시 공개해도 NEW 가 아니라 UP).
  await s.update("Profiles", profile.id, {
    introMd: d.introMd, draftMd: d.introMd, introStatus: "approved", approvedAt: now, updatedAt: now,
    ...(profile.firstApprovedAt ? {} : { firstApprovedAt: profile.approvedAt || now }),
  });
  if (tlOn && d.statements) {
    const tl = await myTruthLies(g.s.mid, aid);
    const tlPatch = { statements: JSON.stringify(d.statements), lieIndex: String(d.lieIndex), status: "approved", approvedAt: now };
    if (tl) await s.update("TruthLies", tl.id, tlPatch);
    else await s.insert("TruthLies", { memberId: g.s.mid, eventActivityId: aid, ...tlPatch });
  }
  // '내가 누구일까요?' 별칭 소개: 아직 맞히지 않은 참여자에게 맞히기 알림
  if (inAct) await notifyNewWhoIntro(w, g.s.mid).catch(() => undefined);
  // 프로필 북에 새 소개가 올라오거나 바뀌었다는 알림(본인 제외, 내용 없이 숫자만)
  await notifyProfilePush(g.s.mid);
  return NextResponse.json({ ok: true, inActivity: inAct });
}

// 승인 취소: 다시 초안이 되어 다른 회원에게 보이지 않는다. 다시 고쳐서 승인할 수 있다.
export async function DELETE(_req: Request, ctx: Ctx) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;
  const closed = writeClosed(w) ?? (await writeGate(w, g.s.mid));
  if (closed) return closed;
  const s = await getStore();
  const profile = await myProfile(g.s.mid);
  if (!profile || profile.introStatus !== "approved") return bad("승인된 소개가 없어요.");
  await s.update("Profiles", profile.id, { introStatus: "draft", draftMd: profile.introMd, updatedAt: new Date().toISOString() });
  const tl = await myTruthLies(g.s.mid, aid);
  if (tl) await s.update("TruthLies", tl.id, { status: "draft" });
  return NextResponse.json({ ok: true });
}
