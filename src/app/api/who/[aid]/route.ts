import { NextResponse } from "next/server";
import { sajuCanRedo } from "@/lib/saju-run";
import { hasBlock, sajuOpen, sajuWhenOf } from "@/lib/blocks";
import { revealTime } from "@/lib/activities";
import { guard, parseJson } from "@/lib/api";
import { isAiEnabled } from "@/lib/ai";
import { ensureAlias, maskedMembers, PROFILE_AID } from "@/lib/profile-book";
import { getStore } from "@/lib/store";
import { interviewView, loadWho, myInterview, myProfile, myTruthLies, questions, skippable, followUpSkippable, whoState, windows } from "@/lib/who";

export const dynamic = "force-dynamic";

// 내 소개 작성 현황. 본인 것만 내려준다(인터뷰 원문 포함, 다른 회원에게는 절대 노출하지 않는다).
//  aid 가 PROFILE_AID 면 프로필 북의 "소개 작성하기"(템플릿 v1, 2진실 1거짓 없음, 실명 공개).
//  state: none(참여 대상 아님) | prompt(기존 소개가 있어 업데이트할지 고르기) | optout(참여 안 함) | in(게임 참여)
export async function GET(_req: Request, ctx: { params: Promise<{ aid: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;

  const s = await getStore();
  const state = await whoState(w, g.s.mid);
  // 게임 참여 중이면 프로필 북에 쓸 랜덤 별칭을 미리 정해 둔다(회원이 바꿀 수 있다)
  if (state === "in") await ensureAlias(g.s.mid);

  // 프로필 북 작성: 참여 중인 활동이 있으면 그 활동에서 쓰도록 안내(blockedBy). 이 화면용 인터뷰가 없고
  // 예전에 활동에서 한 인터뷰가 있으면 가져와서 "기존 인터뷰 수정하기"를 할 수 있게 한다.
  let blockedBy: { aid: string; eventId: string } | null = null;
  if (w.book) {
    blockedBy = (await maskedMembers()).get(g.s.mid) ?? null;
    const own = await myInterview(g.s.mid, PROFILE_AID);
    if (!blockedBy && !own.row) {
      const prev = (await s.list("Interviews"))
        .filter((i) => i.memberId === g.s.mid && i.eventActivityId !== PROFILE_AID && i.status === "done")
        .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0];
      const profile = await myProfile(g.s.mid);
      if (prev && profile && (profile.introStatus === "approved" || profile.introStatus === "draft")) {
        await s.insert("Interviews", { memberId: g.s.mid, eventActivityId: PROFILE_AID, messages: prev.messages, status: "done", updatedAt: new Date().toISOString() });
      }
    }
  }

  const [profile, iv, tl, qs, skips, fuSkip] = await Promise.all([myProfile(g.s.mid), myInterview(g.s.mid, aid), myTruthLies(g.s.mid, aid), questions(w.act), skippable(w.act), followUpSkippable(w.act)]);
  const rt = w.book ? null : revealTime(w.cfg, w.act, w.ev);
  return NextResponse.json({
    activity: { id: aid, name: w.book ? "내 소개 작성하기" : w.cfg.name },
    event: { id: w.ev.id, name: w.ev.name },
    book: !!w.book,
    blockedBy,
    ...windows(w),
    aiEnabled: isAiEnabled(),
    state,
    // 게임 참여(state in)일 때만 활동에 들어간다(2진실 1거짓, 맞히기, 별칭)
    inActivity: state === "in",
    participants: w.cfg.participants,
    // 기능 블록 사주풀이(lib/blocks.ts)와 여는 시점, 2진실 1거짓(사전 단계)
    blocks: { saju: hasBlock(w.cfg, "saju"), truthlies: w.cfg.preEvent.steps.includes("truth_lies") },
    sajuWhen: sajuWhenOf(w.cfg),
    sajuOpen: sajuOpen(w.cfg, w.ev, !!w.book, Date.now(), w.act),
    // 프로필 북 실명 공개 시각(ISO). 이때까지 참여 회원은 프로필 북에 별칭으로만 보인다.
    revealAt: rt ? new Date(rt).toISOString() : "",
    profile: {
      alias: profile?.alias ?? "",
      draftMd: profile?.draftMd ?? "",
      introMd: profile?.introMd ?? "",
      introStatus: profile?.introStatus || "none",
      // 명리 풀이(본인 화면이므로 전체 풀이까지 내려준다)
      readingStatus: profile?.readingStatus ?? "",
      readingMd: profile?.readingMd ?? "",
      traitsMd: profile?.traitsMd ?? "",
      traitsShown: profile?.traitsShown === "true",
      sajuInfo: parseJson<unknown>(profile?.sajuInfo, null),
      sajuRedo: await sajuCanRedo(g.s.mid, profile ?? undefined), // 명리 풀이를 다시 받을 수 있는지(모임설정 "한 번만")
    },
    interview: interviewView(iv.messages, iv.row?.status ?? "", qs.length, skips, fuSkip),
    truthLies: {
      statements: parseJson<string[]>(tl?.statements, ["", "", ""]),
      lieIndex: tl?.lieIndex ? Number(tl.lieIndex) : 0,
      status: tl?.status || "none",
    },
  });
}
