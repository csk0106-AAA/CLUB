import { z } from "zod";

// 회원 개인 설정(Members.prefs JSON): 화면 모드와 알림.
//  theme:    "system"(기기 설정 따름) | "light"(기본) | "dark"
//  notify:   받을 알림 종류 — 행사(events) / 공지글(posts) / 프로필북 수정(profiles)
//  notifyOn: 알림 전체 켜기·끄기
//  sound:    알림 소리 (알림이 꺼져 있으면 항상 꺼짐)
//  quiet:    방해 금지 시간 (알림이 꺼져 있으면 항상 꺼짐). from/to 는 "HH:mm", 밤을 넘길 수 있다(22:00~08:00).
// 알림 발송 쪽에서도 readPrefs 로 읽어서 같은 규칙을 쓴다.
export type Theme = "system" | "light" | "dark";
export type Prefs = {
  theme: Theme;
  notify: { events: boolean; posts: boolean; profiles: boolean };
  notifyOn: boolean;
  sound: boolean;
  quiet: { on: boolean; from: string; to: string };
};

export const THEMES: readonly Theme[] = ["system", "light", "dark"];

export const DEFAULT_PREFS: Prefs = {
  theme: "system",
  notify: { events: true, posts: true, profiles: true },
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
    theme: THEMES.includes(o.theme as Theme) ? (o.theme as Theme) : DEFAULT_PREFS.theme,
    notify: {
      events: bool(n.events, DEFAULT_PREFS.notify.events),
      posts: bool(n.posts, DEFAULT_PREFS.notify.posts),
      profiles: bool(n.profiles, DEFAULT_PREFS.notify.profiles),
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
    theme: z.enum(["system", "light", "dark"]),
    notify: z.object({ events: z.boolean(), posts: z.boolean(), profiles: z.boolean() }).partial().strict(),
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
