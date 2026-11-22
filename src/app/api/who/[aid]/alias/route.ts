import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { findIdentity, termsFrom } from "@/lib/identity";
import { getStore } from "@/lib/store";
import { loadWho, myInterview, myProfile, normAlias, writeClosed, writeGate } from "@/lib/who";
import { ask, extractJson, isAiEnabled } from "@/lib/ai";
import { randomNickname } from "@/lib/nickname";

const body = z.object({ alias: z.string().trim().min(2).max(20) });

// 별칭 정하기: 이름·회사명이 드러나면 안 되고, 다른 회원과 겹치면 안 된다.
export async function POST(req: Request, ctx: { params: Promise<{ aid: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;
  const closed = writeClosed(w) ?? (await writeGate(w, g.s.mid));
  if (closed) return closed;

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("별칭은 2~20자로 적어 주세요.");
  const alias = parsed.data.alias;

  const s = await getStore();
  const members = await s.list("Members");
  const hits = findIdentity(alias, termsFrom(members));
  if (hits.length > 0) return bad("이름, 회사명, 직함은 별칭에 쓸 수 없어요. 다른 별칭을 정해 주세요.");

  const profiles = await s.list("Profiles");
  if (profiles.some((p) => p.memberId !== g.s.mid && normAlias(p.alias) === normAlias(alias))) {
    return bad("다른 회원이 이미 쓰는 별칭이에요. 다른 별칭을 정해 주세요.");
  }

  const mine = await myProfile(g.s.mid);
  if (mine?.introStatus === "approved") return bad("승인된 소개가 있어요. 승인을 취소한 뒤 바꿀 수 있어요.", 409);
  const now = new Date().toISOString();
  // 소개 글 초안에 예전 별칭이 들어 있으면(예: 제목 "'글로우웜'입니다") 새 별칭으로 함께 바꾼다.
  const old = mine?.alias ?? "";
  const draftMd = old && old !== alias && mine?.draftMd ? mine.draftMd.split(old).join(alias) : mine?.draftMd ?? "";
  if (mine) await s.update("Profiles", mine.id, { alias, draftMd, updatedAt: now });
  else await s.insert("Profiles", { memberId: g.s.mid, alias, introStatus: "none", updatedAt: now });
  return NextResponse.json({ ok: true, alias, draftMd });
}

// 별칭 AI 추천: 인터뷰 답변과 소개 글로 별칭 후보 3개를 만든다(저장하지 않는다 — 고른 뒤 “바꾸기”).
//  이름·회사명이 드러나거나 다른 회원 별칭과 겹치는 후보는 뺀다. AI가 꺼져 있으면 무작위 별칭을 준다.
export async function PUT(_req: Request, ctx: { params: Promise<{ aid: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;
  const closed = writeClosed(w) ?? (await writeGate(w, g.s.mid));
  if (closed) return closed;

  const s = await getStore();
  const [members, profiles] = await Promise.all([s.list("Members"), s.list("Profiles")]);
  const terms = termsFrom(members);
  const taken = profiles.filter((p) => p.memberId !== g.s.mid && p.alias).map((p) => p.alias);
  const mine = profiles.find((p) => p.memberId === g.s.mid);
  const ok = (a: string) => a.length >= 2 && a.length <= 20 && findIdentity(a, terms).length === 0 && !taken.some((t) => normAlias(t) === normAlias(a)) && normAlias(a) !== normAlias(mine?.alias ?? "");

  const out: string[] = [];
  if (isAiEnabled()) {
    const iv = await myInterview(g.s.mid, aid);
    const answers = iv.messages.filter((m) => m.role === "me" && !m.skipped).map((m) => m.text).join("\n").slice(0, 4000);
    const intro = (mine?.draftMd || mine?.introMd || "").slice(0, 2000);
    const text = await ask(
      `'내가 누구일까요?' 게임에서 쓸 별칭을 지어 줍니다. 별칭은 그 사람의 취미·성향·이야기를 은근히 담되, 누구인지 바로 알 수 없어야 합니다.
- 2~12자의 한국어 별칭 3개(예: "평상 위의 독서가", "새벽 산책자")
- 이름·회사명·직함·지역 등 신원이 드러나는 말은 쓰지 않는다
- 이미 쓰는 별칭과 겹치지 않는다: ${taken.join(", ") || "(없음)"}
반드시 JSON 하나만 출력합니다: {"aliases":["...","...","..."]}`,
      [{ role: "user", content: `[인터뷰 답변]\n${answers || "(없음)"}\n\n[소개 글]\n${intro || "(없음)"}` }],
      400,
    );
    const p = z.object({ aliases: z.array(z.string().trim()) }).safeParse(extractJson(text ?? ""));
    if (p.success) for (const a of p.data.aliases) if (ok(a) && !out.includes(a)) out.push(a);
  }
  // 모자라면 무작위 별칭으로 채운다
  for (let i = 0; out.length < 3 && i < 20; i++) {
    const a = randomNickname([...taken, ...out]);
    if (ok(a) && !out.includes(a)) out.push(a);
  }
  return NextResponse.json({ aliases: out.slice(0, 3) });
}
