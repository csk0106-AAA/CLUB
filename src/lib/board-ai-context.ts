import { eventVisible } from "./audience";
import { clubLeaders, clubMembers, readAllClubInfo } from "./clubs";
import { duesAccount, duesDueLabel, duesSummary, readClubDues, readDues } from "./dues";
import { GENERAL_POSITION } from "./fee";
import { getLists } from "./lists";
import { getRequirement } from "./member-apps";
import { isGuest } from "./member-kind";
import { getClubNames, getStore } from "./store";

// 게시판 "AI에게 작성 요청하기"에 함께 보내는 참고 정보(관리자가 앱에 저장해 둔 내용).
//  group: 모임 정보(이름·정회원 조건·임원진·회원 수), dues: 모임 회비, rules: 확정 회칙,
//  events: 다가오는 일정(글쓴이에게 보이는 공개 일정만), clubs: 고른 소모임의 개요·회장·회비·회원 수
import type { RefKey } from "./board";
export { REF_KEYS } from "./board";

const MAX_SECTION = 6000;
const cut = (t: string) => (t.length > MAX_SECTION ? `${t.slice(0, MAX_SECTION)}\n…(길어서 줄였어요)` : t);
const won = (n: string) => (n ? `${Number(n).toLocaleString("ko-KR")}원` : "");
const lines = (pairs: [string, string | undefined][]) => pairs.filter(([, v]) => v && v.trim()).map(([k, v]) => `- ${k}: ${v!.trim()}`).join("\n");
const todayKst = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

export async function buildRefContext(refs: RefKey[], clubs: string[], mid: string): Promise<string> {
  const s = await getStore();
  const members = await s.list("Members");
  const active = members.filter((m) => !isGuest(m.kind));
  const out: string[] = [];

  if (refs.includes("group")) {
    const n = await getClubNames();
    const officers = active
      .filter((m) => m.position && m.position.trim() !== "-" && m.position.trim() !== GENERAL_POSITION)
      .map((m) => `${m.position.trim()} ${m.name}`);
    const lists = await getLists();
    out.push(`[모임 정보]\n${lines([
      ["모임 이름", n.clubName],
      ["줄인 이름", n.clubShortName],
      ["회원 수", `${active.length}명`],
      ["정회원 필수 조건", await getRequirement()],
      ["임원진", officers.join(", ")],
      ["소모임", lists.clubs.join(", ")],
    ])}`);
  }

  if (refs.includes("dues")) {
    const d = await readDues();
    out.push(`[모임 회비]\n${lines([
      ["회비", duesSummary(d)],
      ["납부 기한", duesDueLabel(d)],
      ["입금 계좌", duesAccount(d)],
      ["예금주", d.holder],
      ["안내", d.note],
    ]) || "- (아직 정하지 않았어요)"}`);
  }

  if (refs.includes("rules")) {
    const rules = (await s.list("Rules")).filter((r) => r.confirmed === "true");
    const text = rules.map((r) => `${[r.chapter, r.article].filter(Boolean).join(" ")}\n${r.body}`).join("\n\n");
    out.push(`[회칙(확정본)]\n${cut(text) || "(확정된 회칙이 없어요)"}`);
  }

  if (refs.includes("events")) {
    const me = members.find((m) => m.id === mid);
    const today = todayKst();
    const evs = (await s.list("Events"))
      .filter((e) => eventVisible(e, me ?? mid))
      .filter((e) => { const d = (e.endsAt || e.startsAt || "").slice(0, 10); return !d || d >= today; })
      .sort((a, b) => (a.startsAt || "9999").localeCompare(b.startsAt || "9999"))
      .slice(0, 10);
    const text = evs.map((e) => {
      const when = [e.startsAt?.replace("T", " "), e.endsAt ? `~ ${e.endsAt.replace("T", " ")}` : ""].filter(Boolean).join(" ");
      return `- ${e.name} (${e.club ? `${e.club} 소모임` : e.type})${when ? ` · ${when}` : ""}${e.place ? ` · ${e.place}` : ""}${e.booking ? `\n  안내: ${e.booking.replace(/\n/g, " / ").slice(0, 300)}` : ""}`;
    }).join("\n");
    out.push(`[다가오는 일정]\n${text || "(예정된 공개 일정이 없어요)"}`);
  }

  if (clubs.length) {
    const info = await readAllClubInfo();
    for (const c of clubs.slice(0, 10)) {
      const i = info[c];
      const dues = await readClubDues(c);
      const leaders = clubLeaders(members, c).map((l) => `${l.role} ${l.name}`);
      const feeLine = dues ? duesSummary(dues) : i?.feeAmount ? won(i.feeAmount) : "";
      const acct = dues ? duesAccount(dues) : [i?.bank, i?.account].filter(Boolean).join(" ");
      out.push(cut(`[소모임: ${c}]\n${lines([
        ["소개", i?.intro],
        ["모임 주기", i?.cycle],
        ["주요 장소", i?.place],
        ["회원 수", `${clubMembers(members, c).length}명`],
        ["직책자", leaders.join(", ")],
        ["회비", feeLine],
        ["납부 기한", dues ? duesDueLabel(dues) : ""],
        ["회비 안내", dues?.note || i?.feeText],
        ["입금 계좌", acct],
        ["예금주", dues?.holder || i?.holder],
        ["운영 정책", i?.policy],
      ])}`));
    }
  }
  return out.join("\n\n");
}
