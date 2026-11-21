import { NextResponse } from "next/server";
import { z } from "zod";
import { ask, extractJson, isAiEnabled } from "./ai";
import { commonGuide } from "./ai-guides";
import { checkSaju, sajuReadingPrompt } from "./saju-reading";
import { bad } from "./api";
import { memberGenderPatch } from "./gender-edit";
import { generalize, termsFrom } from "./identity";
import { computeSaju, sajuInfoOf, sajuInput, sajuSummary } from "./saju";
import { getStore } from "./store";
import type { Row } from "./store/types";
import { myProfile } from "./who";

// 기능 블록 "명리학 사주풀이"의 처리(어느 활동에서나 같다). 풀이는 회원마다 하나(Profiles)라 활동이 달라도 이어진다.
//  호출하는 쪽(/api/who/[aid]/reading, /api/saju/[aid])이 참여 대상·여는 시점을 먼저 확인한다.
//  sajuPost(raw): { skip: true } → 사주 안 보기 / { gender, calendar, leap, date, time } → 사주 계산 → AI 풀이 → 저장
//    · 입력 정보와 사주 원국은 sajuInfo 에 저장해 본인에게만 보여 준다. 풀이를 지우면 함께 지운다.
//    · 성별은 회원정보 값을 쓴다(없으면 입력받아 회원정보에 저장).
//    · traitsMd(성격·성향)는 소개 페이지 끝에 공개, readingMd(생애주기 전체)는 본인만.
//  sajuPatch({ traitsShown }) → 소개 페이지에서 성격·성향 빼기/다시 넣기 / sajuDelete → 풀이 지우기

async function ensureProfile(memberId: string): Promise<Row> {
  const p = await myProfile(memberId);
  if (p) return p;
  return (await getStore()).insert("Profiles", { memberId, alias: "", introStatus: "none", updatedAt: new Date().toISOString() });
}

const out = z.object({ public: z.string().trim(), private: z.string().trim() }); // 길이·신원 단서는 checkSaju 가 본다
export async function sajuPost(memberId: string, raw: unknown, act: Row | undefined): Promise<NextResponse> {
  const s = await getStore();
  const profile = await ensureProfile(memberId);

  if (raw && typeof raw === "object" && (raw as { skip?: unknown }).skip === true) {
    await s.update("Profiles", profile.id, { readingStatus: "skipped", updatedAt: new Date().toISOString() });
    return NextResponse.json({ readingStatus: "skipped" });
  }

  const parsed = sajuInput.safeParse(raw);
  if (!parsed.success) return bad("생년월일(양력/음력)과 태어난 시간을 확인해 주세요. 시간을 모르면 '모름'을 골라 주세요.");
  if (!isAiEnabled()) return bad("AI가 아직 연결되지 않아 명리 풀이를 만들 수 없어요.", 503);

  // 성별: 회원정보에 있으면 항상 그 값을 쓰고, 없으면 여기서 고른 값을 쓰면서 회원정보에도 저장한다.
  const me = (await s.list("Members")).find((m) => m.id === memberId);
  const known = me?.gender === "남" || me?.gender === "여" ? me.gender : "";
  const gender = (known || parsed.data.gender) as "남" | "여" | undefined;
  if (!gender) return bad("성별을 골라 주세요.");
  if (!known && me) await s.update("Members", me.id, memberGenderPatch(me, gender)); // 회원이 처음 정한 것으로 기록
  const input = { ...parsed.data, gender };

  let saju;
  try {
    saju = computeSaju(input);
  } catch {
    return bad("날짜를 확인해 주세요. 음력이라면 그 해에 있는 날짜인지, 윤달 여부가 맞는지 봐 주세요.");
  }

  const terms = termsFrom(await s.list("Members"));
  // 명리학 사주풀이(lib/saju-reading.ts): 공개 글(소개 페이지의 성격·성향) + 나만 보기(생애주기 풀이). 명리학 필수 지침이 항상 들어간다.
  const p = sajuReadingPrompt({ audiences: ["public", "private"], saju: sajuSummary(saju, gender), context: await commonGuide(act) });
  const messages: { role: "user" | "assistant"; content: string }[] = [...p.messages];
  let result: { traits: string; full: string } | null = null;
  for (let attempt = 0; attempt < 2 && !result; attempt++) {
    const text = await ask(p.system, messages, 8000);
    if (!text) break;
    const o = out.safeParse(extractJson(text));
    if (o.success) {
      const traits = generalize(o.data.public, terms);
      if (!checkSaju("public", traits, terms) && !checkSaju("private", o.data.private, terms)) {
        result = { traits, full: o.data.private };
        break;
      }
    }
    messages.push(
      { role: "assistant", content: text },
      { role: "user", content: "형식이 맞지 않거나, public 에 연도·나이·띠·간지 글자처럼 신원을 짐작할 단서가 있거나, 길이가 맞지 않아요. 명리학 필수 지침대로 JSON 하나만 다시 출력해 주세요." },
    );
  }
  if (!result) return bad("AI가 풀이를 만들지 못했어요. 잠시 후 다시 시도해 주세요.", 502);

  // 소개가 이미 배포돼 있으면 성격·성향은 바로 공개하지 않는다(회원이 읽어 보고 "소개 페이지에 싣기"를 눌러야 공개).
  // 아직 배포 전이면 싣기로 두고, 소개를 최종 배포할 때 함께 공개된다(배포 전 프로필은 아무에게도 보이지 않는다).
  const published = profile.introStatus === "approved";
  const traitsShown = !published;
  await s.update("Profiles", profile.id, {
    readingMd: result.full,
    sajuInfo: JSON.stringify(sajuInfoOf(input, saju)), // 본인에게만 보여 줌
    traitsMd: result.traits,
    traitsShown: String(traitsShown),
    readingStatus: "done",
    updatedAt: new Date().toISOString(),
  });
  return NextResponse.json({ readingStatus: "done", traitsMd: result.traits, readingMd: result.full, traitsShown, published });
}

const patch = z.object({ traitsShown: z.boolean() });

export async function sajuPatch(memberId: string, raw: unknown): Promise<NextResponse> {
  const parsed = patch.safeParse(raw);
  if (!parsed.success) return bad("요청을 확인해 주세요.");
  const profile = await myProfile(memberId);
  if (!profile?.traitsMd) return bad("명리 풀이가 없어요.", 404);
  await (await getStore()).update("Profiles", profile.id, { traitsShown: String(parsed.data.traitsShown), updatedAt: new Date().toISOString() });
  return NextResponse.json({ traitsShown: parsed.data.traitsShown });
}

export async function sajuDelete(memberId: string): Promise<NextResponse> {
  const profile = await myProfile(memberId);
  if (!profile) return NextResponse.json({ ok: true });
  await (await getStore()).update("Profiles", profile.id, {
    readingMd: "", sajuInfo: "", traitsMd: "", traitsShown: "", readingStatus: "", updatedAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true });
}
