import type { ReactNode } from "react";
import type { AvatarView } from "@/lib/avatar";

// 프로필 사진: 직접 올린 사진 또는 아래 캐릭터 중 하나. 고르지 않았으면 기본 = 새싹이.
// 서버가 내려주는 모양(lib/avatar.ts 의 avatarView): 사진이면 주소(src), 캐릭터면 key.
// 캐릭터 key 목록은 lib/avatar.ts 의 AVATAR_KEYS 와 같아야 한다.
export type { AvatarView };

// 띠 동물 그림은 모두 100×100 칸에 파스텔 동그라미 바탕을 깔고, 새싹이처럼 둥근 얼굴·큰 눈·볼터치로 그린다.
const INK = "#2E2430";
const svg = (size: number, bg: string, children: ReactNode, box = 100) => (
  <svg width={size} height={size} viewBox={`0 0 ${box} ${box}`} aria-hidden="true" focusable="false" style={{ display: "block", flex: "none" }}>
    <circle cx={box / 2} cy={box / 2} r={box / 2} fill={bg} />
    {children}
  </svg>
);
// 반짝이는 큰 눈 두 개(가운데에서 dx 만큼 양옆)
const eyes = (y: number, dx = 12, rx = 5.5, ry = 6.5) => (
  <>
    {[-1, 1].map((d) => (
      <g key={d}>
        <ellipse cx={50 + d * dx} cy={y} rx={rx} ry={ry} fill={INK} />
        <circle cx={50 + d * dx + rx * 0.35} cy={y - ry * 0.38} r={rx * 0.42} fill="#fff" />
        <circle cx={50 + d * dx - rx * 0.35} cy={y + ry * 0.4} r={rx * 0.2} fill="#fff" />
      </g>
    ))}
  </>
);
const cheeks = (y: number, dx = 21, fill = "#FF8FA3", op = 0.55) => (
  <>
    <ellipse cx={50 - dx} cy={y} rx="5.5" ry="3.5" fill={fill} opacity={op} />
    <ellipse cx={50 + dx} cy={y} rx="5.5" ry="3.5" fill={fill} opacity={op} />
  </>
);
const line = { stroke: INK, strokeWidth: 2.6, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;
const smile = (y: number, w = 10) => <path d={`M${50 - w / 2} ${y}q${w / 2} ${w * 0.45} ${w} 0`} {...line} />;
// 고양이 입(ω)
const wMouth = (y: number) => <path d={`M44.5 ${y}q2.75 3.2 5.5 0q2.75 3.2 5.5 0`} {...line} strokeWidth={2.2} />;
// 좌우 대칭: 왼쪽에 그린 것을 오른쪽에 거울처럼 한 번 더
const pair = (child: ReactNode) => (
  <>
    {child}
    <g transform="translate(100 0) scale(-1 1)">{child}</g>
  </>
);

export const CHARACTERS: { key: string; label: string; render: (size: number) => ReactNode }[] = [
  {
    key: "sprout", label: "새싹이",
    render: (s) => svg(s, "#E6F8D5", (
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
    ), 80),
  },
  {
    key: "rat", label: "쥐",
    render: (s) => svg(s, "#F2E6F4", (
      <>
        {pair(<><circle cx="26" cy="33" r="15" fill="#A9AEC2" /><circle cx="26" cy="33" r="9" fill="#F7BFCB" /></>)}
        <ellipse cx="50" cy="60" rx="29" ry="26" fill="#C3C7D6" />
        {eyes(56, 12)}
        {cheeks(67, 19)}
        {pair(<path d="M14 64l10 1M15 71l9-3" stroke="#8E93A8" strokeWidth="1.8" strokeLinecap="round" />)}
        <ellipse cx="50" cy="65.5" rx="3.6" ry="2.7" fill="#F27E98" />
        <rect x="47.3" y="71" width="5.4" height="4.6" rx="1.2" fill="#fff" stroke="#8E93A8" strokeWidth="1" />
        {wMouth(68.5)}
      </>
    )),
  },
  {
    key: "ox", label: "소",
    render: (s) => svg(s, "#FFE2D4", (
      <>
        {pair(<path d="M30 36Q15 34 16 18Q22 29 35 30Z" fill="#FFF3D6" stroke="#E2C391" strokeWidth="1.6" strokeLinejoin="round" />)}
        {pair(<><ellipse cx="20" cy="47" rx="10" ry="5.5" transform="rotate(-18 20 47)" fill="#fff" stroke="#E8D6CB" strokeWidth="1.5" /><ellipse cx="20" cy="47" rx="5.5" ry="2.6" transform="rotate(-18 20 47)" fill="#FBC2CF" /></>)}
        <ellipse cx="50" cy="57" rx="28" ry="28" fill="#fff" stroke="#E8D6CB" strokeWidth="1.5" />
        <ellipse cx="64" cy="40" rx="9" ry="6.5" transform="rotate(20 64 40)" fill="#6B5A55" />
        <ellipse cx="33" cy="44" rx="5" ry="3.5" transform="rotate(-15 33 44)" fill="#6B5A55" />
        {eyes(53, 12)}
        <ellipse cx="50" cy="72" rx="19" ry="11.5" fill="#FBC2CF" />
        <ellipse cx="43" cy="70" rx="2.2" ry="2.8" fill="#C8577A" />
        <ellipse cx="57" cy="70" rx="2.2" ry="2.8" fill="#C8577A" />
        {smile(77, 8)}
        {cheeks(62, 23)}
      </>
    )),
  },
  {
    key: "tiger", label: "호랑이",
    render: (s) => svg(s, "#FFF1BF", (
      <>
        {pair(<><circle cx="26" cy="34" r="11" fill="#F59B2F" /><circle cx="26" cy="34" r="6" fill="#FFE1BA" /></>)}
        <ellipse cx="50" cy="59" rx="31" ry="27" fill="#F7A43C" />
        <path d="M50 33v8M42 34.5l2 6M58 34.5l-2 6" stroke="#7A4417" strokeWidth="3.2" strokeLinecap="round" />
        {pair(<path d="M20 53h7M20.5 60h6" stroke="#7A4417" strokeWidth="3" strokeLinecap="round" />)}
        <ellipse cx="50" cy="71" rx="14" ry="9.5" fill="#FFF4E3" />
        {eyes(55, 13)}
        {cheeks(67, 23)}
        <ellipse cx="50" cy="66.5" rx="4.2" ry="2.9" fill="#6B3A16" />
        <path d="M50 69v2" {...line} strokeWidth={2.2} />
        {wMouth(71)}
      </>
    )),
  },
  {
    key: "rabbit", label: "토끼",
    render: (s) => svg(s, "#FDE3EA", (
      <>
        {pair(<g transform="rotate(-8 38 26)"><ellipse cx="38" cy="26" rx="8.5" ry="20" fill="#fff" stroke="#EFCFDA" strokeWidth="2" /><ellipse cx="38" cy="27" rx="4" ry="13" fill="#F9B4C6" /></g>)}
        <ellipse cx="50" cy="63" rx="29" ry="25" fill="#fff" stroke="#EFCFDA" strokeWidth="2" />
        {eyes(59, 12)}
        {cheeks(70, 20)}
        <ellipse cx="50" cy="67.5" rx="3.4" ry="2.5" fill="#F27E98" />
        {wMouth(70.5)}
      </>
    )),
  },
  {
    key: "dragon", label: "용",
    render: (s) => svg(s, "#D3F3EC", (
      <>
        {pair(<path d="M36 36L31 15Q38 22 42 34Z" fill="#FFD166" stroke="#F0B43C" strokeWidth="1.4" strokeLinejoin="round" />)}
        {pair(<path d="M22 52L10 44L14 60Z" fill="#3FB58E" strokeLinejoin="round" stroke="#3FB58E" strokeWidth="3" />)}
        <ellipse cx="50" cy="58" rx="30" ry="27" fill="#5CCBA8" />
        <path d="M45 32l2.5-6 2.5 6 2.5-6 2.5 6Z" fill="#FF9F6B" strokeLinejoin="round" stroke="#FF9F6B" strokeWidth="1.5" />
        <ellipse cx="50" cy="71" rx="17" ry="10.5" fill="#BDF0DD" />
        <circle cx="44" cy="68" r="2" fill="#2E7D63" />
        <circle cx="56" cy="68" r="2" fill="#2E7D63" />
        {pair(<path d="M33 71q-9 1-11-6" stroke="#FFD166" strokeWidth="2.6" fill="none" strokeLinecap="round" />)}
        {eyes(53, 13)}
        {cheeks(63, 22)}
        {smile(75, 10)}
      </>
    )),
  },
  {
    key: "snake", label: "뱀",
    render: (s) => svg(s, "#E8E4FB", (
      <>
        <path d="M24 78Q34 92 56 90Q78 88 82 72Q85 60 77 54" stroke="#E8A93A" strokeWidth="13" fill="none" strokeLinecap="round" />
        <path d="M30 84Q40 89 56 87" stroke="#FCE3A6" strokeWidth="3" fill="none" strokeLinecap="round" opacity=".8" />
        <ellipse cx="50" cy="54" rx="30" ry="23" fill="#F6BE4A" />
        <path d="M50 31l4 4-4 4-4-4ZM37 36l3.5 3.5-3.5 3.5-3.5-3.5ZM63 36l3.5 3.5-3.5 3.5-3.5-3.5Z" fill="#DE9530" />
        {eyes(53, 13)}
        {cheeks(63, 22)}
        <path d="M50 66.5v6.5M50 73l-3 3M50 73l3 3" stroke="#F2546B" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        {smile(64, 12)}
      </>
    )),
  },
  {
    key: "horse", label: "말",
    render: (s) => svg(s, "#F1E5D8", (
      <>
        {pair(<><path d="M31 39L28 17L43 31Z" fill="#B57A4C" strokeLinejoin="round" stroke="#B57A4C" strokeWidth="3" /><path d="M32 33L30.5 23L38 30Z" fill="#F0C9A6" /></>)}
        <ellipse cx="50" cy="58" rx="27" ry="29" fill="#C98B5B" />
        <path d="M37 33Q43 22 51 27Q59 21 65 32Q57 30 53 39Q47 30 37 36Z" fill="#6E4127" />
        <ellipse cx="50" cy="75" rx="17" ry="10" fill="#EFC9A8" />
        <ellipse cx="44" cy="73.5" rx="1.9" ry="2.5" fill="#8A5634" />
        <ellipse cx="56" cy="73.5" rx="1.9" ry="2.5" fill="#8A5634" />
        {smile(79, 8)}
        {eyes(53, 12)}
        {cheeks(63, 20)}
      </>
    )),
  },
  {
    key: "sheep", label: "양",
    render: (s) => svg(s, "#D9EDFC", (
      <>
        {pair(<ellipse cx="25" cy="60" rx="9" ry="5" transform="rotate(25 25 60)" fill="#F2C9AA" />)}
        <g fill="#fff">
          <circle cx="30" cy="40" r="12" /><circle cx="40" cy="30" r="12" /><circle cx="50" cy="27" r="12" />
          <circle cx="60" cy="30" r="12" /><circle cx="70" cy="40" r="12" /><circle cx="27" cy="52" r="10" /><circle cx="73" cy="52" r="10" />
        </g>
        <ellipse cx="50" cy="62" rx="22" ry="22" fill="#FBE3CF" />
        <g fill="#fff"><circle cx="41" cy="43" r="7.5" /><circle cx="50" cy="40.5" r="8" /><circle cx="59" cy="43" r="7.5" /></g>
        {eyes(60, 10, 5, 6)}
        {cheeks(69, 15)}
        {smile(72, 8)}
      </>
    )),
  },
  {
    key: "monkey", label: "원숭이",
    render: (s) => svg(s, "#FBE6CC", (
      <>
        {pair(<><circle cx="21" cy="57" r="10" fill="#A86F48" /><circle cx="21" cy="57" r="5.5" fill="#F3CBA8" /></>)}
        <ellipse cx="50" cy="57" rx="29" ry="28" fill="#A86F48" />
        <path d="M45 31Q47 21 56 26Q50 27 50 32Z" fill="#A86F48" />
        <g fill="#F6D4B6"><circle cx="40" cy="54" r="12" /><circle cx="60" cy="54" r="12" /><ellipse cx="50" cy="69" rx="18" ry="13" /></g>
        {eyes(54, 10, 5, 6)}
        {cheeks(65, 17)}
        <circle cx="47" cy="64" r="1.3" fill="#7A4A2C" />
        <circle cx="53" cy="64" r="1.3" fill="#7A4A2C" />
        {smile(69, 13)}
      </>
    )),
  },
  {
    key: "rooster", label: "닭",
    render: (s) => svg(s, "#DFF4F7", (
      <>
        <g fill="#F25C54"><circle cx="41" cy="30" r="7" /><circle cx="50" cy="25" r="8" /><circle cx="59" cy="30" r="7" /></g>
        <ellipse cx="50" cy="59" rx="28" ry="28" fill="#fff" />
        {eyes(54, 12)}
        {cheeks(65, 21)}
        <ellipse cx="50" cy="77" rx="4" ry="5.5" fill="#F25C54" />
        <path d="M43 64h14l-7 8Z" fill="#FFB627" stroke="#FFB627" strokeWidth="3" strokeLinejoin="round" />
      </>
    )),
  },
  {
    key: "dog", label: "개",
    render: (s) => svg(s, "#E6EEF0", (
      <>
        <ellipse cx="50" cy="57" rx="28" ry="27" fill="#F3D9A8" />
        {pair(<path d="M28 36Q12 37 14 62Q23 65 31 46Z" fill="#B5814F" strokeLinejoin="round" stroke="#B5814F" strokeWidth="2" />)}
        <ellipse cx="50" cy="69" rx="13.5" ry="9.5" fill="#FFF4E2" />
        {eyes(53, 12)}
        {cheeks(64, 21)}
        <path d="M47.3 71.5q2.7 7 5.4 0Z" fill="#F27E98" />
        <path d="M50 66v3" {...line} strokeWidth={2.2} />
        {wMouth(69.5)}
        <ellipse cx="50" cy="64" rx="5" ry="3.6" fill={INK} />
        <ellipse cx="51.5" cy="63" rx="1.6" ry="1" fill="#fff" opacity=".8" />
      </>
    )),
  },
  {
    key: "pig", label: "돼지",
    render: (s) => svg(s, "#E7E9FF", (
      <>
        {pair(<path d="M29 39L25 20L42 31Z" fill="#F59DB4" strokeLinejoin="round" stroke="#F59DB4" strokeWidth="4" />)}
        <ellipse cx="50" cy="59" rx="31" ry="27" fill="#FBB8C8" />
        {eyes(53, 14)}
        {cheeks(65, 23, "#F06A8E", 0.45)}
        <ellipse cx="50" cy="67" rx="11.5" ry="8" fill="#F592AB" />
        <ellipse cx="45.5" cy="67" rx="1.9" ry="2.9" fill="#C8577A" />
        <ellipse cx="54.5" cy="67" rx="1.9" ry="2.9" fill="#C8577A" />
        {smile(78.5, 8)}
      </>
    )),
  },
];

export const CHARACTER_KEYS = CHARACTERS.map((c) => c.key);
export const characterOf = (key: string) => CHARACTERS.find((c) => c.key === key);
const SPROUT = CHARACTERS[0];

// 회원 프로필 사진 한 개. 사진 → 둥글게 잘라 보여 주고, 캐릭터 → 그 그림, 없거나 모르는 캐릭터면 기본 새싹이.
// label 을 주면 그림에 이름을 붙이고(img 역할), 없으면 꾸밈으로 보고 읽지 않는다.
export function Avatar({
  member, size = 40, label,
}: {
  member: { name: string; avatar?: AvatarView };
  size?: number;
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
  const ch = (a?.type === "character" ? characterOf(a.key) : undefined) ?? SPROUT;
  return wrap(ch.render(size));
}
