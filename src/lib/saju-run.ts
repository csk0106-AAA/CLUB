import { NextResponse } from "next/server";
import { z } from "zod";
import { ask, extractJson, isAiEnabled } from "./ai";
import { commonGuide } from "./ai-guides";
import { checkSaju, sajuPartPrompt } from "./saju-reading";
import { bad, parseJson } from "./api";
import { memberGenderPatch } from "./gender-edit";
import { generalize, termsFrom } from "./identity";
import { computeSaju, sajuInfoOf, sajuInput, sajuSummary } from "./saju";
import { getSetting, getStore, setSetting } from "./store";
import type { Row } from "./store/types";
import { myProfile } from "./who";

// 기능 블록 "명리학 사주풀이"의 처리(어느 활동에서나 같다). 풀이는 회원마다 하나(Profiles)라 활동이 달라도 이어진다.
//  호출하는 쪽(/api/who/[aid]/reading, /api/saju/[aid])이 참여 대상·여는 시점을 먼저 확인한다.
//  sajuPost(raw): { skip: true } → 사주 안 보기 / { gender, calendar, leap, date, time } → 사주 계산 → ① 공개 글·원국 설명
//                 → { part: 2 } ② 대운 10년 흐름 → { part: 3 } ③ 주제별 풀이(화면이 차례로 부른다, 분량이 많아 나눔)
//    · 입력 정보와 사주 원국은 sajuInfo 에 저장해 본인에게만 보여 준다. 풀이를 지우면 함께 지운다.
//    · 성별은 회원정보 값을 쓴다(없으면 입력받아 회원정보에 저장).
//    · traitsMd(성격·성향)는 소개 페이지 끝에 공개, readingMd(생애주기 전체)는 본인만.
//  sajuPatch({ traitsShown }) → 소개 페이지에서 성격·성향 빼기/다시 넣기 / sajuDelete → 풀이 지우기

async function ensureProfile(memberId: string): Promise<Row> {
  const p = await myProfile(memberId);
  if (p) return p;
  return (await getStore()).insert("Profiles", { memberId, alias: "", introStatus: "none", updatedAt: new Date().toISOString() });
}

// 다시 받기: 기본은 "한 번만"(sajuOnce, 설정 전에도 한 번만) — 한 번 받은 회원은 다시 만들 수 없다(비용 때문에). 받은 풀이는 계속 볼 수 있다.
//  관리자가 모임설정에서 회원마다 "다시 받기 허용"(sajuRetry:<회원>)을 켜면 한 번 더 받을 수 있고, 다 받으면 다시 막힌다.
//  모두 다시 받게 하려면(테스트 기간) 모임설정의 "다시 받기 허용"으로 바꾼다.
//  받은 기록은 sajuUsed:<회원> 과 풀이 상태로 본다(풀이를 지워도 기록은 남는다).
export async function sajuCanRedo(memberId: string, profile?: Row): Promise<boolean> {
  if (!(await getSetting<boolean>("sajuOnce", true))) return true;
  if (await getSetting<boolean>(`sajuRetry:${memberId}`, false)) return true;
  if (await getSetting<boolean>(`sajuUsed:${memberId}`, false)) return false;
  const st = (profile ?? (await myProfile(memberId)))?.readingStatus ?? "";
  return !(st === "done" || st.startsWith("part"));
}

const part1 = z.object({ public: z.string().trim(), intro: z.string().trim() }); // 길이·신원 단서는 checkSaju 가 본다
// raw: { skip: true } | 사주 정보(첫 단계) | { part: 2 | 3 }(이어서 — 저장해 둔 사주 정보로)
export async function sajuPost(memberId: string, raw: unknown, act: Row | undefined): Promise<NextResponse> {
  const s = await getStore();
  const profile = await ensureProfile(memberId);
  const body = (raw && typeof raw === "object" ? raw : {}) as { skip?: unknown; part?: unknown };

  if (body.skip === true) {
    await s.update("Profiles", profile.id, { readingStatus: "skipped", updatedAt: new Date().toISOString() });
    return NextResponse.json({ readingStatus: "skipped" });
  }
  if (!isAiEnabled()) return bad("AI가 아직 연결되지 않아 명리 풀이를 만들 수 없어요.", 503);
  const terms = termsFrom(await s.list("Members"));
  const context = await commonGuide(act);

  // ② ③ 이어서: 저장해 둔 사주 정보로 다시 계산해 다음 조각을 만들고 뒤에 붙인다
  if (body.part === 2 || body.part === 3) {
    const part = body.part as 2 | 3;
    const need = part === 2 ? "part1" : "part2";
    if (profile.readingStatus !== need) return bad("풀이를 처음부터 다시 만들어 주세요.", 409);
    const info = parseJson<{ gender?: string; calendar?: "solar" | "lunar"; leap?: boolean; date?: string; time?: string | null } | null>(profile.sajuInfo, null);
    const again = sajuInput.safeParse({ calendar: info?.calendar, leap: !!info?.leap, date: info?.date, time: info?.time ?? null });
    if (!info?.gender || !again.success) return bad("저장된 사주 정보가 없어요. 정보를 다시 넣어 주세요.", 409);
    const saju = computeSaju({ ...again.data, gender: info.gender as "남" | "여" });
    const p = sajuPartPrompt(part, { saju: sajuSummary(saju, info.gender), context });
    let text: string | null = null;
    for (let attempt = 0; attempt < 2 && !text; attempt++) {
      const t = await ask(p.system, p.messages, 14000);
      if (t && !checkSaju("private", t, terms)) text = t.replace(/^\`\`\`(?:markdown|md)?\s*/i, "").replace(/\`\`\`\s*$/, "").trim();
    }
    if (!text) return bad("AI가 풀이를 만들지 못했어요. 잠시 후 “이어서 만들기”를 눌러 주세요.", 502);
    const done = part === 3;
    await s.update("Profiles", profile.id, {
      readingMd: `${(profile.readingMd ?? "").trim()}\n\n${text}`,
      readingStatus: done ? "done" : "part2",
      updatedAt: new Date().toISOString(),
    });
    if (done) {
      await setSetting(`sajuUsed:${memberId}`, true);
      await setSetting(`sajuRetry:${memberId}`, false); // 관리자가 허용한 한 번을 썼다
    }
    return NextResponse.json({ readingStatus: done ? "done" : "part2", part });
  }

  // ① 첫 단계: 사주 정보 받기 → 계산 → 공개 글 + 원국 설명
  if (!(await sajuCanRedo(memberId, profile))) return bad("명리학 풀이는 한 번만 받을 수 있어요. 이미 받은 풀이를 확인해 주세요.", 409);
  const parsed = sajuInput.safeParse(raw);
  if (!parsed.success) return bad("생년월일(양력/음력)과 태어난 시간을 확인해 주세요. 시간을 모르면 '모름'을 골라 주세요.");

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

  const p = sajuPartPrompt(1, { saju: sajuSummary(saju, gender), context });
  const messages: { role: "user" | "assistant"; content: string }[] = [...p.messages];
  let result: { traits: string; intro: string } | null = null;
  for (let attempt = 0; attempt < 2 && !result; attempt++) {
    const text = await ask(p.system, messages, 6000);
    if (!text) break;
    const o = part1.safeParse(extractJson(text));
    if (o.success) {
      const traits = generalize(o.data.public, terms);
      if (!checkSaju("public", traits, terms) && o.data.intro.length >= 100) {
        result = { traits, intro: o.data.intro };
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
    readingMd: result.intro,
    sajuInfo: JSON.stringify(sajuInfoOf(input, saju)), // 본인에게만 보여 줌
    traitsMd: result.traits,
    traitsShown: String(traitsShown),
    readingStatus: "part1", // 이어서 ② 대운 흐름 ③ 주제별 풀이를 만든다(화면이 차례로 부른다)
    updatedAt: new Date().toISOString(),
  });
  return NextResponse.json({ readingStatus: "part1", part: 1, traitsShown, published });
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
