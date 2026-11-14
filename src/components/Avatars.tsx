import type { ReactNode } from "react";
import { Mascot } from "./Mascot";
import { fs } from "@/lib/fs";
import type { AvatarView } from "@/lib/avatar";

// 프로필 사진: 직접 올린 사진 또는 아래 캐릭터 중 하나. 고르지 않았으면 기본(새싹이 또는 이름 첫 글자).
// 서버가 내려주는 모양(lib/avatar.ts 의 avatarView): 사진이면 주소(src), 캐릭터면 key.
// 캐릭터 key 목록은 lib/avatar.ts 의 AVATAR_KEYS 와 같아야 한다.
export type { AvatarView };

// 캐릭터 그림은 모두 80×80 칸에 동그란 바탕을 깔고 그린다.
const svg = (size: number, children: ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 80 80" aria-hidden="true" focusable="false" style={{ display: "block", flex: "none" }}>
    {children}
  </svg>
);
const eyes = (y: number, dx = 11, r = 4, ink = "#2b2b2b") => (
  <>
    <circle cx={40 - dx} cy={y} r={r} fill={ink} />
    <circle cx={40 + dx} cy={y} r={r} fill={ink} />
    <circle cx={40 - dx + 1.3} cy={y - 1.3} r={r * 0.35} fill="#fff" />
    <circle cx={40 + dx + 1.3} cy={y - 1.3} r={r * 0.35} fill="#fff" />
  </>
);

export const CHARACTERS: { key: string; label: string; render: (size: number) => ReactNode }[] = [
  {
    key: "sprout", label: "새싹이",
    render: (s) => svg(s, (
      <>
        <circle cx="40" cy="40" r="40" fill="#E6F8D5" />
        <g transform="translate(8 9) scale(.8)">
          <path d="M40 4c-2 6 0 10 4 12-6 0-9-3-10-7 2-3 4-5 6-5z" fill="#46A302" />
          <path d="M40 16c-2-6 2-12 10-12-1 7-4 11-10 12z" fill="#58CC02" />
          <ellipse cx="40" cy="46" rx="32" ry="30" fill="#58CC02" />
          <ellipse cx="28" cy="40" rx="11" ry="12" fill="#fff" />
          <ellipse cx="52" cy="40" rx="11" ry="12" fill="#fff" />
          <circle cx="30" cy="42" r="5.5" fill="#173B00" />
          <circle cx="50" cy="42" r="5.5" fill="#173B00" />
          <circle cx="32" cy="40" r="1.8" fill="#fff" />
          <circle cx="52" cy="40" r="1.8" fill="#fff" />
          <path d="M33 56q7 7 14 0" stroke="#173B00" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        </g>
      </>
    )),
  },
  {
    key: "bear", label: "곰",
    render: (s) => svg(s, (
      <>
        <circle cx="40" cy="40" r="40" fill="#F3E3D3" />
        <circle cx="19" cy="22" r="9" fill="#8A5A3B" />
        <circle cx="61" cy="22" r="9" fill="#8A5A3B" />
        <circle cx="19" cy="22" r="4.5" fill="#C99A74" />
        <circle cx="61" cy="22" r="4.5" fill="#C99A74" />
        <ellipse cx="40" cy="44" rx="26" ry="24" fill="#8A5A3B" />
        <ellipse cx="40" cy="53" rx="12" ry="9" fill="#E2C3A3" />
        {eyes(40, 10, 3.6)}
        <ellipse cx="40" cy="49" rx="4" ry="3" fill="#2b2b2b" />
        <path d="M36 56q4 3 8 0" stroke="#2b2b2b" strokeWidth="2" fill="none" strokeLinecap="round" />
      </>
    )),
  },
  {
    key: "cat", label: "고양이",
    render: (s) => svg(s, (
      <>
        <circle cx="40" cy="40" r="40" fill="#FFE9D2" />
        <path d="M15 34 L18 10 L34 22 Z" fill="#F29A4A" />
        <path d="M65 34 L62 10 L46 22 Z" fill="#F29A4A" />
        <path d="M19 28 L20 16 L29 23 Z" fill="#FFC9A8" />
        <path d="M61 28 L60 16 L51 23 Z" fill="#FFC9A8" />
        <ellipse cx="40" cy="45" rx="27" ry="23" fill="#F29A4A" />
        <path d="M33 24 l3 7 M40 22 v8 M47 24 l-3 7" stroke="#D2772B" strokeWidth="2.5" strokeLinecap="round" />
        <ellipse cx="40" cy="54" rx="11" ry="8" fill="#FFF3E6" />
        {eyes(43, 11, 3.8)}
        <path d="M37 50 h6 l-3 3 z" fill="#E86A7A" />
        <path d="M40 53 q-3 4 -6 2 M40 53 q3 4 6 2" stroke="#2b2b2b" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <path d="M20 50 h9 M20 55 l9 -2 M60 50 h-9 M60 55 l-9 -2" stroke="#8a5530" strokeWidth="1.4" strokeLinecap="round" />
      </>
    )),
  },
  {
    key: "fox", label: "여우",
    render: (s) => svg(s, (
      <>
        <circle cx="40" cy="40" r="40" fill="#FFE4CC" />
        <path d="M13 38 L16 8 L36 26 Z" fill="#E8692C" />
        <path d="M67 38 L64 8 L44 26 Z" fill="#E8692C" />
        <path d="M18 30 L19 16 L29 25 Z" fill="#3a2a22" />
        <path d="M62 30 L61 16 L51 25 Z" fill="#3a2a22" />
        <path d="M12 36 Q14 22 40 22 Q66 22 68 36 Q64 58 40 70 Q16 58 12 36 Z" fill="#E8692C" />
        <path d="M14 40 Q26 44 40 70 Q54 44 66 40 Q62 58 40 70 Q18 58 14 40 Z" fill="#FFF7EF" />
        {eyes(41, 11, 3.6)}
        <ellipse cx="40" cy="60" rx="4" ry="3" fill="#2b2b2b" />
      </>
    )),
  },
  {
    key: "owl", label: "부엉이",
    render: (s) => svg(s, (
      <>
        <circle cx="40" cy="40" r="40" fill="#E9E3F7" />
        <path d="M16 22 L24 10 L30 22 Z M64 22 L56 10 L50 22 Z" fill="#6B4F9E" />
        <ellipse cx="40" cy="46" rx="26" ry="26" fill="#6B4F9E" />
        <ellipse cx="40" cy="58" rx="14" ry="12" fill="#B9A6DD" />
        <path d="M33 54 q3 2 6 0 M41 54 q3 2 6 0 M37 60 q3 2 6 0" stroke="#6B4F9E" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <circle cx="29" cy="37" r="10" fill="#fff" />
        <circle cx="51" cy="37" r="10" fill="#fff" />
        <circle cx="29" cy="37" r="5" fill="#2b2b2b" />
        <circle cx="51" cy="37" r="5" fill="#2b2b2b" />
        <circle cx="30.5" cy="35.5" r="1.7" fill="#fff" />
        <circle cx="52.5" cy="35.5" r="1.7" fill="#fff" />
        <path d="M36 44 L44 44 L40 50 Z" fill="#F2A33A" />
      </>
    )),
  },
  {
    key: "penguin", label: "펭귄",
    render: (s) => svg(s, (
      <>
        <circle cx="40" cy="40" r="40" fill="#DCEFFB" />
        <ellipse cx="40" cy="46" rx="27" ry="27" fill="#24364A" />
        <path d="M40 30 Q22 26 20 44 Q20 66 40 70 Q60 66 60 44 Q58 26 40 30 Z" fill="#fff" />
        {eyes(42, 9, 3.6)}
        <path d="M34 49 L46 49 L40 56 Z" fill="#F2A33A" />
        <circle cx="27" cy="52" r="3.2" fill="#FFB8C2" opacity=".8" />
        <circle cx="53" cy="52" r="3.2" fill="#FFB8C2" opacity=".8" />
      </>
    )),
  },
  {
    key: "rabbit", label: "토끼",
    render: (s) => svg(s, (
      <>
        <circle cx="40" cy="40" r="40" fill="#FDE3EA" />
        <ellipse cx="29" cy="18" rx="7" ry="17" fill="#fff" stroke="#E7C9D2" strokeWidth="1.5" />
        <ellipse cx="51" cy="18" rx="7" ry="17" fill="#fff" stroke="#E7C9D2" strokeWidth="1.5" />
        <ellipse cx="29" cy="19" rx="3.2" ry="11" fill="#F7A9BC" />
        <ellipse cx="51" cy="19" rx="3.2" ry="11" fill="#F7A9BC" />
        <ellipse cx="40" cy="50" rx="25" ry="22" fill="#fff" stroke="#E7C9D2" strokeWidth="1.5" />
        {eyes(47, 10, 3.6)}
        <ellipse cx="40" cy="55" rx="3" ry="2.2" fill="#E86A7A" />
        <path d="M40 57 v3 M40 60 q-3 3 -6 1 M40 60 q3 3 6 1" stroke="#2b2b2b" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <circle cx="25" cy="56" r="3.5" fill="#FFB8C2" opacity=".8" />
        <circle cx="55" cy="56" r="3.5" fill="#FFB8C2" opacity=".8" />
      </>
    )),
  },
  {
    key: "whale", label: "고래",
    render: (s) => svg(s, (
      <>
        <circle cx="40" cy="40" r="40" fill="#D6F0FA" />
        <path d="M40 22 v-6 M40 16 q-5 -6 -9 -3 M40 16 q5 -6 9 -3" stroke="#3B9FD8" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <path d="M10 48 Q10 26 38 26 Q66 26 66 46 Q66 64 40 66 Q16 66 10 48 Z" fill="#3B9FD8" />
        <path d="M64 44 Q72 34 76 38 Q72 44 76 52 Q70 52 64 50 Z" fill="#3B9FD8" />
        <path d="M14 52 Q36 60 64 50 Q60 64 40 66 Q18 66 14 52 Z" fill="#BDE6F7" />
        {eyes(42, 12, 3.4)}
        <path d="M33 50 q7 5 14 0" stroke="#1d4e6b" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      </>
    )),
  },
];

export const CHARACTER_KEYS = CHARACTERS.map((c) => c.key);
export const characterOf = (key: string) => CHARACTERS.find((c) => c.key === key);

// 이름 첫 글자 동그라미 색(이름마다 늘 같은 색)
const TONES = [
  ["var(--blue-bg)", "var(--blue-t)"],
  ["var(--green-bg)", "var(--green-t)"],
  ["var(--orange-bg)", "var(--orange-t)"],
  ["var(--red-bg)", "var(--red-t)"],
] as const;
function toneOf(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

// 회원 프로필 사진 한 개. 사진 → 둥글게 잘라 보여 주고, 캐릭터 → 그 그림, 없으면 fallback(이름 첫 글자 또는 새싹이).
// label 을 주면 그림에 이름을 붙이고(img 역할), 없으면 꾸밈으로 보고 읽지 않는다.
export function Avatar({
  member, size = 40, fallback = "initial", label,
}: {
  member: { name: string; avatar?: AvatarView };
  size?: number;
  fallback?: "initial" | "mascot";
  label?: string;
}) {
  const a = member.avatar ?? null;
  const wrap = (child: ReactNode) => (
    <span
      role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}
      style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", display: "inline-flex", flex: "none", alignItems: "center", justifyContent: "center" }}
    >
      {child}
    </span>
  );
  if (a?.type === "photo") {
    // 로그인 회원만 받는 사진이라 next/image 최적화를 쓰지 않고 그대로 보여 준다
    return wrap(<img src={a.src} alt="" width={size} height={size} style={{ width: size, height: size, objectFit: "cover", display: "block", background: "var(--soft)" }} />);
  }
  const ch = a?.type === "character" ? characterOf(a.key) : undefined;
  if (ch) return wrap(ch.render(size));
  if (fallback === "mascot") return wrap(<Mascot size={size} />);
  const [bg, ink] = toneOf(member.name || "?");
  return wrap(
    <span style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: bg, color: ink, font: `700 ${fs(Math.round(size * 0.42), 1)} var(--body)` }}>
      {(member.name || "?").trim().charAt(0)}
    </span>,
  );
}
