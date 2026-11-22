import { NextResponse } from "next/server";
import { z } from "zod";
import { ask, extractJson, followUpPrompt, isAiEnabled } from "@/lib/ai";
import { guidelinesFor } from "@/lib/ai-guides";
import { bad, guard, parseJson } from "@/lib/api";
import { newAlias } from "@/lib/profile-book";
import { getStore } from "@/lib/store";
import {
  dropStaleTruthLies, followUpMax, followUpSkippable, inGame, interviewView, loadWho, myInterview, myProfile, myTruthLies, questions, SKIP_TEXT, skippable, writeClosed, writeGate, type ChatMsg,
} from "@/lib/who";

// skip: 지금 질문을 "답변안함"으로 넘긴다(템플릿에서 그 질문에 답변안함을 허용했을 때만)
// choice: 공통 질문 뒤 묻는 것에 대한 답 — go(AI 추가 질문 진행) / none(안 함) / no(다시 진행 안 함 → 유지할지 묻기) / keep(이전 AI 답 유지) / drop(이전 AI 답 지우기)
const body = z.object({ answer: z.string().trim().min(1).max(2000).optional(), skip: z.boolean().optional(), choice: z.enum(["go", "none", "no", "keep", "drop"]).optional() });
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
  const fuSkip = await followUpSkippable(w.act);
  const max = await followUpMax(w.act);
  let { row, messages } = await myInterview(g.s.mid, aid);
  if (row?.status === "done") return bad("인터뷰가 끝났어요. 소개 글 만들기로 넘어가 주세요.", 409);

  const answered = () => messages.filter((m) => m.role === "me").length;

  // 답 없이 다시 열었을 때(이어쓰기): 이미 질문이 있으면 그대로 돌려준다.
  if (!parsed.data.answer && !parsed.data.skip && !parsed.data.choice && messages.length > 0) {
    return NextResponse.json({ interview: interviewView(messages, row?.status ?? "active", qs.length, skips, fuSkip, isAiEnabled() ? max : 0, row) });
  }

  const aiOn = isAiEnabled() && max > 0;
  const stash = parseJson<ChatMsg[]>(row?.stash, []);
  // 행에 함께 저장할 값(공통 질문 뒤 AI 추가 질문 흐름)
  const extraPatch: Record<string, string> = {};
  let done = false;
  let askNext = true; // 다음 질문을 정할지(고르기를 묻는 중이면 묻지 않는다)

  if (parsed.data.choice) {
    const c = parsed.data.choice;
    const ch = row?.choose ?? "";
    if (!ch) return bad("지금은 고를 것이 없어요. 화면을 새로 고쳐 주세요.", 409);
    if (ch === "ai") {
      if (c === "go") Object.assign(extraPatch, { aiPlan: "go", choose: "", notice: "" });
      else { Object.assign(extraPatch, { aiPlan: "none", choose: "", notice: "AI 추가 질문 없이 마쳤어요." }); done = true; askNext = false; }
    } else if (ch === "redo") {
      if (c === "go") Object.assign(extraPatch, { aiPlan: "go", choose: "", stash: "", notice: "" });
      else { Object.assign(extraPatch, { choose: "keep" }); askNext = false; }
    } else if (ch === "keep") {
      if (c === "drop") {
        Object.assign(extraPatch, { aiPlan: "none", choose: "", stash: "", notice: `이전 AI 질문 답변 ${Math.floor(stash.length / 2)}개를 모두 지웠어요.` });
      } else {
        // 유지: 바뀐 공통 답변과 맞지 않거나 겹치는 이전 AI 질문·답은 AI가 골라 지운다(AI가 없으면 모두 유지)
        const pairs: { q: string; a: ChatMsg }[] = [];
        for (let i = 0; i + 1 < stash.length; i += 2) if (stash[i].role === "ai" && stash[i + 1].role === "me") pairs.push({ q: stash[i].text, a: stash[i + 1] });
        let keepIdx = pairs.map((_, i) => i);
        if (isAiEnabled() && pairs.length) {
          const common = messages.reduce<string[]>((acc, m, i) => (m.role === "me" && messages[i - 1]?.role === "ai" ? [...acc, `질문: ${messages[i - 1].text}\n답: ${m.skipped ? "(답하지 않음)" : m.text}`] : acc), []).join("\n\n");
          const out = await ask(
            `회원이 공통 질문에 다시 답했습니다. 예전에 받은 AI 추가 질문과 답 중에서, 새 공통 답변과 내용이 어긋나거나 이제는 맞지 않는 것을 고릅니다. 그대로 써도 되는 것만 남깁니다.
반드시 JSON 하나만 출력합니다: {"keep":[남길 번호들]}`,
            [{ role: "user", content: `[새 공통 질문과 답]\n${common}\n\n[예전 AI 추가 질문과 답]\n${pairs.map((p, i) => `${i}. 질문: ${p.q}\n답: ${p.a.skipped ? "(답하지 않음)" : p.a.text}`).join("\n\n")}` }],
            400,
          );
          const k = z.object({ keep: z.array(z.number().int()) }).safeParse(extractJson(out ?? ""));
          if (k.success) keepIdx = k.data.keep.filter((i) => i >= 0 && i < pairs.length);
        }
        const kept = keepIdx.sort((x, y) => x - y).flatMap((i) => [{ role: "ai", text: pairs[i].q } as ChatMsg, pairs[i].a]);
        messages = [...messages, ...kept];
        const removed = pairs.length - keepIdx.length;
        Object.assign(extraPatch, {
          aiPlan: "kept", choose: "", stash: "",
          notice: removed > 0 ? `이전 AI 질문 답변 ${keepIdx.length}개는 그대로 두고, 바뀐 공통 답변과 맞지 않는 ${removed}개는 지웠어요.` : `이전 AI 질문 답변 ${keepIdx.length}개를 그대로 두었어요.`,
        });
      }
      done = true;
      askNext = false;
    }
  } else if (parsed.data.skip) {
    if (!interviewView(messages, row?.status ?? "active", qs.length, skips, fuSkip, isAiEnabled() ? max : 0, row).canSkip) return bad("이 질문은 답변안함으로 넘길 수 없어요. 답을 적어 주세요.");
    messages = [...messages, { role: "me", text: SKIP_TEXT, scope: "none", skipped: true } as ChatMsg];
  } else if (parsed.data.answer) {
    if (messages.length === 0 || messages[messages.length - 1].role !== "ai") return bad("먼저 질문을 받아 주세요.");
    messages = [...messages, { role: "me", text: parsed.data.answer, scope: "intro" } as ChatMsg];
  }

  // 다음 질문 정하기
  const n = answered();
  const plan = extraPatch.aiPlan ?? row?.aiPlan ?? "";
  if (!askNext) {
    // 고르기를 묻는 중이거나 끝냄
  } else if (n < qs.length) {
    messages = [...messages, { role: "ai", text: qs[n] }];
  } else if (n === qs.length && aiOn && !plan) {
    // 공통 질문을 마침: AI 추가 질문을 할지 채팅으로 묻는다(이전 AI 답이 있으면 다시 진행할지부터)
    Object.assign(extraPatch, { choose: stash.length ? "redo" : "ai", notice: "" });
  } else if (aiOn && (plan === "go" || (!plan && n > qs.length)) && n - qs.length < max) {
    // "답변안함"으로 넘긴 질문은 후속 질문을 만들 때 빼고 본다
    const qa = messages.reduce<{ q: string; a: string }[]>((acc, m, i) => {
      if (m.role === "me" && !m.skipped && messages[i - 1]?.role === "ai") acc.push({ q: messages[i - 1].text, a: m.text });
      return acc;
    }, []);
    // 답변안함으로 넘긴 질문(필수·AI 질문 모두): 비슷한 주제를 다시 묻지 않게 알려 준다
    const skippedQs = messages.flatMap((m, i) => (m.role === "me" && m.skipped && messages[i - 1]?.role === "ai" ? [messages[i - 1].text] : []));
    const p = followUpPrompt(await guidelinesFor("followup", w.act), qa, skippedQs);
    // 한도를 너무 작게 잡으면 빈 응답이 와서 인터뷰가 일찍 끝나므로 넉넉히 둔다(질문은 한 문장).
    const next = await ask(p.system, p.messages, 2000);
    if (!next || next.replace(/[\s."]/g, "") === "없음") done = true;
    else messages = [...messages, { role: "ai", text: next }];
  } else if (!done) {
    done = true;
  }

  const patch = { messages: JSON.stringify(messages), status: done ? "done" : "active", updatedAt: new Date().toISOString(), ...extraPatch };
  if (row) row = (await s.update("Interviews", row.id, patch)) ?? { ...row, ...patch };
  else row = await s.insert("Interviews", { memberId: g.s.mid, eventActivityId: aid, ...patch });
  return NextResponse.json({ interview: interviewView(messages, patch.status, qs.length, skips, fuSkip, isAiEnabled() ? max : 0, row) });
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

// AI 인터뷰 다시 하기: 이 인터뷰와 내 소개(공개·초안), 이 활동의 2진실 1거짓을 지우고 공통 질문부터 다시.
// 이전 AI 추가 질문·답은 보관했다가, 공통 질문을 마치면 다시 진행할지·유지할지 채팅으로 묻는다.
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
  const { row, messages: old } = await myInterview(g.s.mid, aid);
  // 이전 AI 추가 질문·답(공통 질문 개수 뒤의 질문·답 쌍)은 보관해 두고, 공통 질문을 다시 마치면 다시 진행할지·유지할지 묻는다
  const qn = (await questions(w.act)).length;
  const stash: ChatMsg[] = [];
  let k = 0;
  old.forEach((m, i) => { if (m.role === "me") { if (k >= qn && old[i - 1]?.role === "ai") stash.push(old[i - 1], m); k++; } });
  const reset = { messages: "[]", status: "active", updatedAt: now, aiPlan: "", choose: "", notice: "", stash: stash.length ? JSON.stringify(stash) : "" };
  // 행은 남겨 둔다(활동의 참여 상태 in 표시) — 메시지만 비운다
  if (row) await s.update("Interviews", row.id, reset);
  else await s.insert("Interviews", { memberId: g.s.mid, eventActivityId: aid, ...reset });
  const profile = await myProfile(g.s.mid);
  if (profile) await s.update("Profiles", profile.id, { introMd: "", draftMd: "", introStatus: "none", updatedAt: now });
  const tl = await myTruthLies(g.s.mid, aid);
  if (tl) await s.remove("TruthLies", tl.id);
  await dropStaleTruthLies(g.s.mid, aid); // 다른 활동에 남은 예전 2진실 1거짓(공개 전)도
  if (await inGame(w, g.s.mid)) await newAlias(g.s.mid);
  return NextResponse.json({ ok: true });
}
