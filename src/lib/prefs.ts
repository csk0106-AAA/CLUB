import { z } from "zod";

// 회원 개인 설정(Members.prefs JSON): 화면 모드와 알림.
//  screen:   화면 모드 "dark"(어두운 화면, 기본 — 그래파이트 & 레몬) | "light"(밝은 화면) | "system"(폰 설정 따라)
//            (예전 theme 값은 지금 화면과 달라 읽지 않는다)
//  notify:   받을 알림 종류 — 일정(events) / 공지(notices: 게시글을 꺼도 공지는 받음) / 게시글(posts: 공지 포함 모든 글)
//            / 프로필 북(profiles) / 신청 피드백(feedback: 내가 낸 신청의 결과) / 신청(requests: 처리할 신청, 관리자만 화면에 보임)
//  notifyOn: 알림 전체 켜기·끄기
//  sound:    알림 소리 (알림이 꺼져 있으면 항상 꺼짐)
//  quiet:    방해 금지 시간 (알림이 꺼져 있으면 항상 꺼짐). from/to 는 "HH:mm", 밤을 넘길 수 있다(22:00~08:00).
// 알림 발송 쪽에서도 readPrefs 로 읽어서 같은 규칙을 쓴다.
export type Theme = "system" | "light" | "dark";
export type MapChoice = "ask" | "google" | "naver";
export type Prefs = {
  screen: Theme;
  map: MapChoice; // 지도 보기: ask(매번 고르기, 기본) | google | naver (lib/map-pref.ts)
  notify: { events: boolean; notices: boolean; posts: boolean; profiles: boolean; feedback: boolean; requests: boolean };
  notifyOn: boolean;
  sound: boolean;
  quiet: { on: boolean; from: string; to: string };
};

export const THEMES: readonly Theme[] = ["system", "light", "dark"];

export const DEFAULT_PREFS: Prefs = {
  screen: "dark",
  map: "ask",
  notify: { events: true, notices: true, posts: true, profiles: true, feedback: true, requests: true },
  notifyOn: true,
  sound: true,
  quiet: { on: false, from: "22:00", to: "08:00" },
};

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

// 저장된 JSON(또는 이미 읽은 값)을 안전한 Prefs 로: 모르는 값은 기본값, 알림이 꺼져 있으면 소리·방해 금지도 끈다.
export function readPrefs(text?: string | null): Prefs {
  let raw: unknown = null;
  if (text) {
    try {
      raw = JSON.parse(text);
    } catch {
      raw = null;
    }
  }
  return sanitizePrefs(raw);
}

export function sanitizePrefs(raw: unknown): Prefs {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const hm = (v: unknown, d: string) => (typeof v === "string" && HM.test(v) ? v : d);
  const n = o.notify && typeof o.notify === "object" ? (o.notify as Record<string, unknown>) : {};
  const q = o.quiet && typeof o.quiet === "object" ? (o.quiet as Record<string, unknown>) : {};
  const notifyOn = bool(o.notifyOn, DEFAULT_PREFS.notifyOn);
  return {
    screen: THEMES.includes(o.screen as Theme) ? (o.screen as Theme) : DEFAULT_PREFS.screen,
    map: o.map === "google" || o.map === "naver" ? o.map : "ask",
    notify: {
      events: bool(n.events, DEFAULT_PREFS.notify.events),
      notices: bool(n.notices, DEFAULT_PREFS.notify.notices),
      posts: bool(n.posts, DEFAULT_PREFS.notify.posts),
      profiles: bool(n.profiles, DEFAULT_PREFS.notify.profiles),
      feedback: bool(n.feedback, DEFAULT_PREFS.notify.feedback),
      requests: bool(n.requests, DEFAULT_PREFS.notify.requests),
    },
    notifyOn,
    sound: notifyOn && bool(o.sound, DEFAULT_PREFS.sound),
    quiet: {
      on: notifyOn && bool(q.on, DEFAULT_PREFS.quiet.on),
      from: hm(q.from, DEFAULT_PREFS.quiet.from),
      to: hm(q.to, DEFAULT_PREFS.quiet.to),
    },
  };
}

// 바꿀 항목만 보내도 된다(부분 수정). 서버는 기존 값에 덮어쓴 뒤 sanitizePrefs 로 규칙을 적용한다.
export const prefsInput = z
  .object({
    screen: z.enum(["system", "light", "dark"]),
    map: z.enum(["ask", "google", "naver"]),
    notify: z.object({ events: z.boolean(), notices: z.boolean(), posts: z.boolean(), profiles: z.boolean(), feedback: z.boolean(), requests: z.boolean() }).partial().strict(),
    notifyOn: z.boolean(),
    sound: z.boolean(),
    quiet: z
      .object({
        on: z.boolean(),
        from: z.string().regex(HM, "시간은 00:00 형식으로 적어 주세요."),
        to: z.string().regex(HM, "시간은 00:00 형식으로 적어 주세요."),
      })
      .partial()
      .strict(),
  })
  .partial()
  .strict();

export type PrefsInput = z.infer<typeof prefsInput>;

// 기존 설정 + 바꿀 항목 → 새 설정
export function mergePrefs(cur: Prefs, patch: PrefsInput): Prefs {
  return sanitizePrefs({
    ...cur,
    ...patch,
    notify: { ...cur.notify, ...(patch.notify ?? {}) },
    quiet: { ...cur.quiet, ...(patch.quiet ?? {}) },
  });
}

// 방해 금지 시간인지 (한국 시간 "HH:mm" 기준, 밤을 넘기는 구간 지원). 알림 발송 쪽에서 쓴다.
export function inQuietHours(p: Prefs, hm: string): boolean {
  if (!p.notifyOn || !p.quiet.on) return false;
  const { from, to } = p.quiet;
  if (from === to) return false;
  return from < to ? hm >= from && hm < to : hm >= from || hm < to;
}
