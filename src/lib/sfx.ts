"use client";

// 진행 효과음(진행자 화면, 프로젝터 스피커)과 회원 휴대폰 진동.
// 소리 파일 없이 브라우저가 바로 만든다(Web Audio). 휴대폰·태블릿은 화면을 한 번 누른 뒤에야 소리가 나므로
// 진행자 화면의 버튼을 누를 때 함께 켜진다(unlockSfx). 켜고 끄기는 이 기기에만 저장한다.
type Ctx = AudioContext;
let ctx: Ctx | null = null;
const KEY = "moit-sfx";

export function sfxOn(): boolean {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}
export function setSfxOn(on: boolean): void {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* 저장 못 해도 이번 화면에서는 적용 */ }
}
function ac(): Ctx | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch { return null; }
}
// 버튼을 누를 때 불러서 소리를 낼 수 있게 깨운다
export function unlockSfx(): void { ac(); }

function tone(freq: number, at: number, dur: number, type: OscillatorType = "sine", vol = 0.18, toFreq?: number): void {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}
const kick = (at: number, vol = 0.5) => tone(150, at, 0.35, "sine", vol, 45);
const snare = (at: number, vol = 0.12) => tone(320, at, 0.08, "triangle", vol, 180);

const SOUNDS = {
  // 소개 열기·맞히기·투표 시작: 경쾌한 "띵동"
  ding: () => { tone(880, 0, 0.3); tone(1318, 0.13, 0.4); },
  // 마감: 짧은 북소리 "둥!"
  drum: () => { kick(0); snare(0.02, 0.08); },
  // 저예요 대기: 두구두구(1.2초)
  roll: () => { for (let i = 0; i < 18; i++) snare(i * 0.065, 0.05 + i * 0.006); },
  // 이름 공개: "짠!"
  tada: () => { [523, 659, 784].forEach((f) => tone(f, 0, 0.6, "triangle", 0.14)); tone(1046, 0.08, 0.7, "triangle", 0.16); },
  // 정답 공개: "딩동댕"
  correct: () => { tone(784, 0, 0.22, "sine", 0.2); tone(659, 0.2, 0.22, "sine", 0.2); tone(1046, 0.4, 0.5, "sine", 0.22); },
  // 시상: 팡파레
  fanfare: () => {
    const n = [523, 523, 523, 659, 784, 1046];
    n.forEach((f, i) => tone(f, i * 0.13, i === n.length - 1 ? 0.9 : 0.12, "square", 0.08));
    [523, 659, 784, 1046].forEach((f) => tone(f, 0.78, 0.9, "triangle", 0.1));
  },
  // 룰렛 한 칸: "틱"
  tick: () => tone(1800, 0, 0.03, "square", 0.05),
  // 고민 뽑기: "뾰롱"
  pop: () => tone(400, 0, 0.18, "sine", 0.2, 1400),
  // 대화 시간 끝: "삐삐"
  beep: () => { tone(1000, 0, 0.15, "square", 0.08); tone(1000, 0.25, 0.15, "square", 0.08); },
  // 타임캡슐 봉인: "철컥"
  lock: () => { tone(2400, 0, 0.04, "square", 0.08); kick(0.06, 0.35); tone(900, 0.06, 0.05, "square", 0.06); },
};
export type Sfx = keyof typeof SOUNDS;

export function playSfx(name: Sfx): void {
  if (!sfxOn()) return;
  try { SOUNDS[name](); } catch { /* 소리를 못 내도 진행에는 영향 없음 */ }
}

// 회원 휴대폰 진동(안드로이드만, 아이폰은 지원하지 않는다)
export function buzz(pattern: number | number[] = [120, 60, 120]): void {
  try { if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern); } catch { /* 무시 */ }
}
