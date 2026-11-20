import { NextResponse } from "next/server";
import { z } from "zod";
import { ask, followUpPrompt, isAiEnabled } from "@/lib/ai";
import { guidelinesFor } from "@/lib/ai-guides";
import { bad, guard } from "@/lib/api";
import { newAlias } from "@/lib/profile-book";
import { getStore } from "@/lib/store";
import {
  followUpMax, inGame, interviewView, loadWho, myInterview, myProfile, myTruthLies, questions, SKIP_TEXT, skippable, writeClosed, writeGate, type ChatMsg,
} from "@/lib/who";

// skip: 지금 질문을 "답변안함"으로 넘긴다(템플릿에서 그 질문에 답변안함을 허용했을 때만)
const body = z.object({ answer: z.string().trim().min(1).max(2000).optional(), skip: z.boolean().optional() });
type Ctx = { params: Promise<{ aid: string }> };

// 인터뷰 진행. 필수 질문(관리자가 편집)을 차례로 묻고, AI가 켜져 있으면 후속 질문을 최대 N개까지 이어서 묻는다.
// 답을 보내면 저장되므로 중간에 나갔다가 이어서 쓸 수 있다.
export async function POST(req: Request, ctx: Ctx) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;
  const closed = writeClosed(w) ?? (await writeGate(w, g.s.mid));
  if (closed) return closed;

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("답변은 2000자까지 쓸 수 있어요.");

  // 별칭은 인터뷰가 끝난 뒤 AI가 소개 글과 함께 제안하므로, 인터뷰 전에는 필요 없다.

  const s = await getStore();
  const qs = await questions(w.act);
  const skips = await skippable(w.act);
  const max = await followUpMax(w.act);
  let { row, messages } = await myInterview(g.s.mid, aid);
  if (row?.status === "done") return bad("인터뷰가 끝났어요. 소개 글 만들기로 넘어가 주세요.", 409);

  const answered = () => messages.filter((m) => m.role === "me").length;

  // 답 없이 다시 열었을 때(이어쓰기): 이미 질문이 있으면 그대로 돌려준다.
  if (!parsed.data.answer && !parsed.data.skip && messages.length > 0) {
    return NextResponse.json({ interview: interviewView(messages, row?.status ?? "active", qs.length, skips) });
  }

  if (parsed.data.skip) {
    if (!interviewView(messages, row?.status ?? "active", qs.length, skips).canSkip) return bad("이 질문은 답변안함으로 넘길 수 없어요. 답을 적어 주세요.");
    messages = [...messages, { role: "me", text: SKIP_TEXT, scope: "none", skipped: true } as ChatMsg];
  } else if (parsed.data.answer) {
    if (messages.length === 0 || messages[messages.length - 1].role !== "ai") return bad("먼저 질문을 받아 주세요.");
    messages = [...messages, { role: "me", text: parsed.data.answer, scope: "intro" } as ChatMsg];
  }

  // 다음 질문 정하기
  let done = false;
  const n = answered();
  if (n < qs.length) {
    messages = [...messages, { role: "ai", text: qs[n] }];
  } else if (isAiEnabled() && n - qs.length < max) {
    // "답변안함"으로 넘긴 질문은 후속 질문을 만들 때 빼고 본다
    const qa = messages.reduce<{ q: string; a: string }[]>((acc, m, i) => {
      if (m.role === "me" && !m.skipped && messages[i - 1]?.role === "ai") acc.push({ q: messages[i - 1].text, a: m.text });
      return acc;
    }, []);
    const p = followUpPrompt(await guidelinesFor("followup", w.act), qa);
    // 한도를 너무 작게 잡으면 빈 응답이 와서 인터뷰가 일찍 끝나므로 넉넉히 둔다(질문은 한 문장).
    const next = await ask(p.system, p.messages, 2000);
    if (!next || next.replace(/[\s."]/g, "") === "없음") done = true;
    else messages = [...messages, { role: "ai", text: next }];
  } else {
    done = true;
  }

  const patch = { messages: JSON.stringify(messages), status: done ? "done" : "active", updatedAt: new Date().toISOString() };
  if (row) await s.update("Interviews", row.id, patch);
  else row = await s.insert("Interviews", { memberId: g.s.mid, eventActivityId: aid, ...patch });
  return NextResponse.json({ interview: interviewView(messages, patch.status, qs.length, skips) });
}

// 기존 인터뷰 수정하기: 질문별 내 답변을 고쳐 저장한다(질문은 그대로).
// 저장하면 소개 글을 새 답변으로 다시 만들어야 하므로, 공개된 소개는 초안으로 돌린다(다시 배포할 때까지 다른 회원에게 안 보임).
// 빈 답변("")은 "답변안함"으로 넘긴 질문에만 쓸 수 있다(그대로 답변안함). 답을 적으면 답한 것으로 바뀐다.
const edit = z.object({ answers: z.array(z.string().trim().max(2000)).min(1).max(60) });

export async function PUT(req: Request, ctx: Ctx) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;
  const closed = writeClosed(w) ?? (await writeGate(w, g.s.mid));
  if (closed) return closed;
  const parsed = edit.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(parsed.error.issues.find((i) => /[가-힣]/.test(i.message))?.message ?? "답변은 2000자까지 쓸 수 있어요.");

  const s = await getStore();
  const { row, messages } = await myInterview(g.s.mid, aid);
  // 인터뷰 중에도 앞 질문의 답을 다시 쓸 수 있다(끝난 뒤에는 "기존 인터뷰 수정하기")
  if (!row) return bad("인터뷰를 먼저 시작해 주세요.", 409);
  const mine = messages.filter((m) => m.role === "me").length;
  if (parsed.data.answers.length !== mine) return bad("인터뷰가 바뀌었어요. 화면을 새로 고쳐 주세요.", 409);
  const mineMsgs = messages.filter((m) => m.role === "me");
  if (parsed.data.answers.some((a, i) => !a && !mineMsgs[i]?.skipped)) return bad("빈 답변이 있어요. 답변을 적어 주세요.");
  let k = 0;
  const next = messages.map((m) => {
    if (m.role !== "me") return m;
    const a = parsed.data.answers[k++];
    return a ? { role: m.role, text: a, scope: "intro" as const } : { ...m, text: SKIP_TEXT, scope: "none" as const, skipped: true };
  });
  await s.update("Interviews", row.id, { messages: JSON.stringify(next), updatedAt: new Date().toISOString() });

  const profile = await myProfile(g.s.mid);
  if (profile?.introStatus === "approved") {
    await s.update("Profiles", profile.id, { introStatus: "draft", draftMd: profile.introMd, updatedAt: new Date().toISOString() });
    const tl = await myTruthLies(g.s.mid, aid);
    if (tl) await s.update("TruthLies", tl.id, { status: "draft" });
  }
  return NextResponse.json({ ok: true });
}

// AI 인터뷰 다시 하기: 이 인터뷰와 내 소개(공개·초안), 이 활동의 2진실 1거짓을 지우고 처음부터.
// 게임 참여 중이면 별칭도 새로 정한다(지운 소개의 별칭을 다시 쓰지 않게). 명리 풀이는 그대로 둔다.
export async function DELETE(_req: Request, ctx: Ctx) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;
  const closed = writeClosed(w) ?? (await writeGate(w, g.s.mid));
  if (closed) return closed;

  const s = await getStore();
  const now = new Date().toISOString();
  const { row } = await myInterview(g.s.mid, aid);
  // 행은 남겨 둔다(활동의 참여 상태 in 표시) — 메시지만 비운다
  if (row) await s.update("Interviews", row.id, { messages: "[]", status: "active", updatedAt: now });
  else await s.insert("Interviews", { memberId: g.s.mid, eventActivityId: aid, messages: "[]", status: "active", updatedAt: now });
  const profile = await myProfile(g.s.mid);
  if (profile) await s.update("Profiles", profile.id, { introMd: "", draftMd: "", introStatus: "none", updatedAt: now });
  const tl = await myTruthLies(g.s.mid, aid);
  if (tl) await s.remove("TruthLies", tl.id);
  if (await inGame(w, g.s.mid)) await newAlias(g.s.mid);
  return NextResponse.json({ ok: true });
}
