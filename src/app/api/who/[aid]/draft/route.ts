import { NextResponse } from "next/server";
import { z } from "zod";
import { ask, extractJson, introAliasPrompt, isAiEnabled } from "@/lib/ai";
import { bad, guard } from "@/lib/api";
import { generateTruthLies, keyWords, qaPairs } from "@/lib/truthlies";
import { findIdentity, generalize, termsFrom } from "@/lib/identity";
import { canJoin } from "@/lib/participants";
import { getStore } from "@/lib/store";
import { guidelinesFor } from "@/lib/ai-guides";
import { loadWho, myInterview, myProfile, myTruthLies, normAlias, writeClosed } from "@/lib/who";

type Ctx = { params: Promise<{ aid: string }> };

// 결과 생성(초안). AI가 켜져 있으면 AI가 쓰고, 아니면 '수동 모드'로 내 답변을 모아 초안을 만들어 주고 직접 고치게 한다.
// 순서: ① 2진실 1거짓을 먼저 만들고 ② 소개 글은 그 내용을 빼고 쓴다 ③ 진실 문장의 핵심 단어가 소개 글에 남으면
// 그 단어를 금지하고 한 번 더 쓴다. (소개 글을 읽고 2진실 1거짓의 정답을 알 수 없게)
// 다시 만들 때도 항상 둘을 함께 새로 만든다. 별칭은 이미 있으면 그대로 둔다.
export async function POST(_req: Request, ctx: Ctx) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;
  const closed = writeClosed(w);
  if (closed) return closed;

  const s = await getStore();
  const profile = await myProfile(g.s.mid);
  if (profile?.introStatus === "approved") return bad("승인된 소개가 있어요. 승인을 취소한 뒤 다시 만들 수 있어요.", 409);
  const iv = await myInterview(g.s.mid, aid);
  const row = iv.row;
  if (!row || row.status !== "done") return bad("인터뷰를 끝낸 뒤에 소개 글을 만들 수 있어요.");
  const messages = iv.messages;
  const terms = termsFrom(await s.list("Members"));
  const answers = messages.filter((m) => m.role === "me").map((m) => generalize(m.text, terms));
  // 불참하는 분은 활동에 들어가지 않으므로 2진실 1거짓은 만들지 않는다(프로필 북용 소개만).
  const inAct = await canJoin(w.cfg, w.act, w.ev, g.s.mid);

  let mode: "ai" | "manual" = "manual";
  let intro = answers.join("\n\n");
  let statements = ["", "", ""];
  let lieIndex = 0;

  // ① 2진실 1거짓 먼저
  if (inAct) {
    const tl = await generateTruthLies("", qaPairs(messages, terms), terms);
    if (tl) {
      statements = tl.statements;
      lieIndex = tl.lieIndex;
    }
  }
  const avoid = statements.filter((x) => x.trim());
  const avoidWords = keyWords(statements.filter((_, i) => i !== lieIndex)); // 진실 문장의 핵심 단어

  // 별칭: 이미 정한 별칭(내가 바꾼 것 포함)이 있으면 그대로 쓰고, 없으면 AI가 인터뷰 내용으로 제안한다.
  let alias = profile?.alias ?? "";
  const taken = (await s.list("Profiles")).filter((p) => p.memberId !== g.s.mid && p.alias).map((p) => p.alias);
  const aliasOk = (a: string) =>
    a.length >= 2 && a.length <= 20 && findIdentity(a, terms).length === 0 && !taken.some((t) => normAlias(t) === normAlias(a));

  // ② 소개 글 + 별칭 (2진실 1거짓 내용은 빼고) ③ 겹침 검사 후 한 번 더
  let leaked: string[] = [];
  if (isAiEnabled()) {
    const guide = await guidelinesFor("draft");
    let banned: string[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const ap = introAliasPrompt(guide, answers, alias, taken, avoid, banned);
      const out = await ask(ap.system, ap.messages, 4000);
      if (!out) break;
      const o = z.object({ alias: z.string().trim(), intro: z.string().min(20) }).safeParse(extractJson(out));
      if (!o.success || (!alias && !aliasOk(o.data.alias))) continue;
      mode = "ai";
      if (!alias) alias = o.data.alias;
      intro = generalize(o.data.intro, terms);
      leaked = avoidWords.filter((k) => intro.includes(k));
      if (leaked.length === 0) break;
      banned = [...new Set([...banned, ...leaked])];
    }
  }

  const now = new Date().toISOString();
  // 프로필이 아직 없으면(별칭 단계를 건너뛰므로) 여기서 만든다. AI가 없으면 별칭은 비워 두고 회원이 정한다.
  if (profile) await s.update("Profiles", profile.id, { alias, draftMd: intro, introStatus: "draft", updatedAt: now });
  else await s.insert("Profiles", { memberId: g.s.mid, alias, draftMd: intro, introStatus: "draft", updatedAt: now });
  if (inAct) {
    const tl = await myTruthLies(g.s.mid, aid);
    const tlPatch = { statements: JSON.stringify(statements), lieIndex: String(lieIndex), status: "draft" };
    if (tl) await s.update("TruthLies", tl.id, tlPatch);
    else await s.insert("TruthLies", { memberId: g.s.mid, eventActivityId: aid, ...tlPatch });
  }

  // leaked: 세 번 써도 소개 글에 남은 2진실 1거짓 단어(화면에서 직접 지우도록 알려 준다)
  return NextResponse.json({ mode, alias, inActivity: inAct, draftMd: intro, statements: inAct ? statements : [], lieIndex, leaked, remaining: findIdentity(intro, terms) });
}

const save = z.object({
  introMd: z.string().max(8000),
  statements: z.array(z.string().max(300)).length(3).optional(),
  lieIndex: z.number().int().min(0).max(2).optional(),
});

// 직접 고친 내용 저장(승인 전 초안). 초안은 다른 회원과 관리자에게 보이지 않는다.
export async function PUT(req: Request, ctx: Ctx) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;
  const closed = writeClosed(w);
  if (closed) return closed;
  const parsed = save.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요. 거짓 번호는 1~3번 중 하나예요.");
  const d = parsed.data;

  const s = await getStore();
  const profile = await myProfile(g.s.mid);
  if (!profile) return bad("소개 글을 먼저 만들어 주세요.");
  if (profile.introStatus === "approved") return bad("승인을 취소한 뒤 고칠 수 있어요.", 409);

  const now = new Date().toISOString();
  await s.update("Profiles", profile.id, { draftMd: d.introMd, introStatus: d.introMd.trim() ? "draft" : "none", updatedAt: now });
  if (d.statements && (await canJoin(w.cfg, w.act, w.ev, g.s.mid))) {
    const tl = await myTruthLies(g.s.mid, aid);
    const tlPatch = { statements: JSON.stringify(d.statements), lieIndex: String(d.lieIndex ?? 0), status: "draft" };
    if (tl) await s.update("TruthLies", tl.id, tlPatch);
    else await s.insert("TruthLies", { memberId: g.s.mid, eventActivityId: aid, ...tlPatch });
  }
  return NextResponse.json({ ok: true });
}
