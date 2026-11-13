import { Lunar, Solar } from "lunar-javascript";
import { z } from "zod";

// 사주팔자 계산(만세력). 날짜·절기·간지 계산은 AI가 틀리기 쉬우므로 라이브러리로 정확히 계산하고,
// AI에는 계산 결과만 넘겨 풀이 글을 쓰게 한다. 입력 원본(생년월일·시간·성별)은 어디에도 저장하지 않는다.

export const sajuInput = z.object({
  gender: z.enum(["남", "여"]).optional(), // 회원정보에 성별이 있으면 서버가 그 값을 쓴다
  calendar: z.enum(["solar", "lunar"]),
  leap: z.boolean().default(false), // 음력 윤달
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable(), // 모르면 null
});
export type SajuInput = z.infer<typeof sajuInput> & { gender: "남" | "여" };

const GAN: Record<string, string> = { 甲: "갑", 乙: "을", 丙: "병", 丁: "정", 戊: "무", 己: "기", 庚: "경", 辛: "신", 壬: "임", 癸: "계" };
const ZHI: Record<string, string> = { 子: "자", 丑: "축", 寅: "인", 卯: "묘", 辰: "진", 巳: "사", 午: "오", 未: "미", 申: "신", 酉: "유", 戌: "술", 亥: "해" };
const WX: Record<string, string> = { 木: "목", 火: "화", 土: "토", 金: "금", 水: "수" };
const SS: Record<string, string> = {
  比肩: "비견", 劫财: "겁재", 食神: "식신", 伤官: "상관", 偏财: "편재", 正财: "정재", 七杀: "편관", 正官: "정관", 偏印: "편인", 正印: "정인", 日主: "일간",
};
const ko = (gz: string) => gz.split("").map((c) => GAN[c] ?? ZHI[c] ?? c).join("");
const wx = (s: string) => s.split("").map((c) => WX[c] ?? c).join("");

export type Saju = {
  pillars: { label: string; ganZhi: string; ko: string; wuxing: string; tenGod: string }[];
  dayMaster: string; // 일간(나)
  elements: Record<string, number>; // 오행 개수
  daeun: { age: number; ganZhi: string; ko: string }[];
  timeKnown: boolean;
  age: number; // 현재 나이(만). 풀이의 '지금 시기'를 짚는 데만 쓰고 공개 글에는 쓰지 않는다.
};

export function computeSaju(input: SajuInput, now = new Date()): Saju {
  const [y, m, d] = input.date.split("-").map(Number);
  // 양력은 라이브러리가 없는 날짜(예: 2월 30일)를 다음 달로 넘겨 버리므로 직접 막는다.
  if (input.calendar === "solar") {
    const t = new Date(Date.UTC(y, m - 1, d));
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) throw new Error("invalid solar date");
  }
  const [hh, mm] = input.time ? input.time.split(":").map(Number) : [12, 0]; // 시간을 모르면 시주는 빼고 정오로 계산
  const lunar = input.calendar === "solar"
    ? Solar.fromYmdHms(y, m, d, hh, mm, 0).getLunar()
    : Lunar.fromYmdHms(y, input.leap ? -m : m, d, hh, mm, 0);
  const ec = lunar.getEightChar();
  const solarYear = lunar.getSolar().getYear();

  const raw = [
    { label: "년주", gz: ec.getYear(), wx: ec.getYearWuXing(), ss: ec.getYearShiShenGan() },
    { label: "월주", gz: ec.getMonth(), wx: ec.getMonthWuXing(), ss: ec.getMonthShiShenGan() },
    { label: "일주", gz: ec.getDay(), wx: ec.getDayWuXing(), ss: "日主" },
    ...(input.time ? [{ label: "시주", gz: ec.getTime(), wx: ec.getTimeWuXing(), ss: ec.getTimeShiShenGan() }] : []),
  ];
  const pillars = raw.map((p) => ({ label: p.label, ganZhi: p.gz, ko: ko(p.gz), wuxing: wx(p.wx), tenGod: SS[p.ss] ?? p.ss }));
  const elements: Record<string, number> = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  for (const p of pillars) for (const c of p.wuxing) if (c in elements) elements[c]++;

  const daeun = ec.getYun(input.gender === "남" ? 1 : 0).getDaYun(10).slice(1).map((x) => ({ age: x.getStartAge(), ganZhi: x.getGanZhi(), ko: ko(x.getGanZhi()) }));
  const age = now.getFullYear() - solarYear - (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d) ? 1 : 0);

  return { pillars, dayMaster: `${ec.getDayGan()}(${GAN[ec.getDayGan()] ?? ""})`, elements, daeun, timeKnown: Boolean(input.time), age };
}

// 본인에게만 보여 줄 입력 정보 + 사주 원국(풀이 첫머리 표시용). 나이는 넣지 않는다.
export type SajuInfo = {
  gender: string; calendar: "solar" | "lunar"; leap: boolean; date: string; time: string | null;
  solarDate: string; // 음력으로 넣었으면 양력 환산 날짜
  pillars: Saju["pillars"]; dayMaster: string; elements: Record<string, number>; daeun: Saju["daeun"];
};
export function sajuInfoOf(input: SajuInput, s: Saju): SajuInfo {
  const [y, m, d] = input.date.split("-").map(Number);
  const solarDate = input.calendar === "solar" ? input.date : Lunar.fromYmdHms(y, input.leap ? -m : m, d, 12, 0, 0).getSolar().toYmd();
  return {
    gender: input.gender, calendar: input.calendar, leap: input.calendar === "lunar" && input.leap, date: input.date, time: input.time,
    solarDate, pillars: s.pillars, dayMaster: s.dayMaster, elements: s.elements, daeun: s.daeun,
  };
}

// AI에 넘길 사주 요약(한 덩어리 글)
export function sajuSummary(s: Saju, gender: string): string {
  return [
    `성별: ${gender}`,
    `사주 원국: ${s.pillars.map((p) => `${p.label} ${p.ganZhi}(${p.ko}) · 오행 ${p.wuxing} · ${p.tenGod}`).join(" / ")}`,
    s.timeKnown ? "" : "태어난 시간을 몰라 시주는 없음(시주 없이 풀이)",
    `일간(나): ${s.dayMaster}`,
    `오행 분포: ${Object.entries(s.elements).map(([k, v]) => `${k} ${v}`).join(", ")}`,
    `대운(시작 나이): ${s.daeun.map((d) => `${d.age}세 ${d.ganZhi}(${d.ko})`).join(", ")}`,
    `현재 만 나이: ${s.age}세`,
  ].filter(Boolean).join("\n");
}
