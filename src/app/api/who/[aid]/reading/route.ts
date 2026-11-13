import { NextResponse } from "next/server";
import { z } from "zod";
import { ask, extractJson, isAiEnabled, readingPrompt } from "@/lib/ai";
import { guidelinesFor } from "@/lib/ai-guides";
import { bad, guard } from "@/lib/api";
import { findIdentity, generalize, termsFrom } from "@/lib/identity";
import { computeSaju, sajuInput, sajuSummary } from "@/lib/saju";
import { getStore } from "@/lib/store";
import type { Row } from "@/lib/store/types";
import { loadWho, myProfile, writeClosed } from "@/lib/who";

type Ctx = { params: Promise<{ aid: string }> };

// 명리학 풀이(선택).
//  POST { skip: true }      → 사주 안 보기
//  POST { gender, calendar, leap, date, time } → 사주 계산 → AI 풀이 → 저장
//    · 생년월일·시간·성별 원본은 계산에만 쓰고 저장하지 않는다(풀이 글만 저장).
//    · traitsMd(성격·성향)는 소개 페이지 끝에 공개, readingMd(생애주기 전체)는 본인만.
//  PATCH { traitsShown }    → 소개 페이지에서 성격·성향 빼기/다시 넣기 (언제든 가능)
//  DELETE                   → 풀이 지우기(다시 고를 수 있게) (언제든 가능)

async function ensureProfile(memberId: string): Promise<Row> {
  const p = await myProfile(memberId);
  if (p) return p;
  return (await getStore()).insert("Profiles", { memberId, alias: "", introStatus: "none", updatedAt: new Date().toISOString() });
}

const out = z.object({ traits: z.string().trim().min(40).max(2000), full: z.string().trim().min(300).max(20000) });
// 공개 글에 신원을 짐작할 단서(연도, 나이, 띠, 간지 글자)가 들어갔는지
// (평범한 낱말 "정신", "기술", "빛을 띠다" 등은 걸리지 않도록 간지는 년·월·일·시·주·생이 붙은 경우만 본다)
const LEAK = new RegExp(
  [
    "\\d{4}\\s*년",
    "\\d{1,3}\\s*(세|살)",
    "(쥐|소|호랑이|범|토끼|용|뱀|말|양|원숭이|닭|개|돼지)\\s*띠(?![고며어다는])",
    "[갑을병정무기경신임계][자축인묘진사오미신유술해]\\s*(년|월|일|시|주|생)",
    "[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]",
  ].join("|"),
);

export async function POST(req: Request, ctx: Ctx) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;
  const closed = writeClosed(w);
  if (closed) return closed;

  const raw = await req.json().catch(() => null);
  const s = await getStore();
  const profile = await ensureProfile(g.s.mid);

  if (raw && raw.skip === true) {
    await s.update("Profiles", profile.id, { readingStatus: "skipped", updatedAt: new Date().toISOString() });
    return NextResponse.json({ readingStatus: "skipped" });
  }

  const parsed = sajuInput.safeParse(raw);
  if (!parsed.success) return bad("성별, 생년월일(양력/음력), 태어난 시간을 확인해 주세요. 시간을 모르면 '모름'을 골라 주세요.");
  if (!isAiEnabled()) return bad("AI가 아직 연결되지 않아 명리 풀이를 만들 수 없어요.", 503);

  let saju;
  try {
    saju = computeSaju(parsed.data);
  } catch {
    return bad("날짜를 확인해 주세요. 음력이라면 그 해에 있는 날짜인지, 윤달 여부가 맞는지 봐 주세요.");
  }

  const terms = termsFrom(await s.list("Members"));
  const p = readingPrompt(await guidelinesFor("reading"), sajuSummary(saju, parsed.data.gender));
  const messages = [...p.messages];
  let result: { traits: string; full: string } | null = null;
  for (let attempt = 0; attempt < 2 && !result; attempt++) {
    const text = await ask(p.system, messages, 8000);
    if (!text) break;
    const o = out.safeParse(extractJson(text));
    if (o.success) {
      const traits = generalize(o.data.traits, terms);
      if (!LEAK.test(traits) && findIdentity(traits, terms).length === 0) {
        result = { traits, full: o.data.full };
        break;
      }
    }
    messages.push(
      { role: "assistant", content: text },
      { role: "user", content: "형식이 맞지 않거나, traits 에 연도·나이·띠·간지 글자처럼 신원을 짐작할 단서가 있어요. 규칙대로 JSON 하나만 다시 출력해 주세요." },
    );
  }
  if (!result) return bad("AI가 풀이를 만들지 못했어요. 잠시 후 다시 시도해 주세요.", 502);

  await s.update("Profiles", profile.id, {
    readingMd: result.full,
    traitsMd: result.traits,
    traitsShown: "true",
    readingStatus: "done",
    updatedAt: new Date().toISOString(),
  });
  return NextResponse.json({ readingStatus: "done", traitsMd: result.traits, readingMd: result.full, traitsShown: true });
}

const patch = z.object({ traitsShown: z.boolean() });

export async function PATCH(req: Request) {
  const g = await guard();
  if ("err" in g) return g.err;
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("요청을 확인해 주세요.");
  const profile = await myProfile(g.s.mid);
  if (!profile?.traitsMd) return bad("명리 풀이가 없어요.", 404);
  await (await getStore()).update("Profiles", profile.id, { traitsShown: String(parsed.data.traitsShown), updatedAt: new Date().toISOString() });
  return NextResponse.json({ traitsShown: parsed.data.traitsShown });
}

export async function DELETE() {
  const g = await guard();
  if ("err" in g) return g.err;
  const profile = await myProfile(g.s.mid);
  if (!profile) return NextResponse.json({ ok: true });
  await (await getStore()).update("Profiles", profile.id, {
    readingMd: "", traitsMd: "", traitsShown: "", readingStatus: "", updatedAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true });
}
