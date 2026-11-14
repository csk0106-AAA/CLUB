import { fs } from "@/lib/fs";
// 선 아이콘(1.8px 선). 글자색(currentColor)을 따른다.
// 크기는 설정 > 글자 크기(--fs)를 따라 커지고 작아진다. max: 배율 상한(하단 탭·윗줄 아이콘처럼 칸이 정해진 곳).
type P = { size?: number; max?: number };
const sz = (size: number, max?: number) => ({ width: fs(size, max), height: fs(size, max), flex: "none" as const });

export function IconHome({ size = 26, max }: P) {
  return <svg width={size} height={size} style={sz(size, max)} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>;
}
// 이전 페이지(왼쪽 화살표)
export function IconBack({ size = 18, max = 1.2 }: P) {
  return <svg width={size} height={size} style={sz(size, max)} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>;
}
// 내보내기(상자에서 위로 나가는 화살표)
export function IconExport({ size = 18, max = 1.2 }: P) {
  return <svg width={size} height={size} style={sz(size, max)} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V3M7 8l5-5 5 5" /><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg>;
}
// 행사 탭(달력)
export function IconCalendar({ size = 26, max }: P) {
  return <svg width={size} height={size} style={sz(size, max)} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>;
}
// 알림(종)
export function IconBell({ size = 24, max }: P) {
  return <svg width={size} height={size} style={sz(size, max)} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>;
}
export function IconProfileBook({ size = 26, max }: P) {
  return <svg width={size} height={size} style={sz(size, max)} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><circle cx="12" cy="10" r="3" /><path d="M7.5 17c.8-2 2.5-3 4.5-3s3.7 1 4.5 3" /></svg>;
}
export function IconGear({ size = 26, max }: P) {
  return <svg width={size} height={size} style={sz(size, max)} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>;
}
export function IconShield({ size = 26, max }: P) {
  return <svg width={size} height={size} style={sz(size, max)} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 3v6c0 5-3.4 8.3-8 9.5-4.6-1.2-8-4.5-8-9.5V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></svg>;
}
// 로그아웃(문 밖으로 나가는 화살표)
export function IconLogout({ size = 24, max }: P) {
  return <svg width={size} height={size} style={sz(size, max)} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /><path d="M10 16l-4-4 4-4M6 12h10" /></svg>;
}
// 게시글(게시판) 탭
export function IconBoard({ size = 26, max }: P) {
  return <svg width={size} height={size} style={sz(size, max)} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7.5 8.5h9M7.5 12h9M7.5 15.5h5.5" /></svg>;
}
// 조직도 탭
export function IconOrg({ size = 26, max }: P) {
  return <svg width={size} height={size} style={sz(size, max)} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="5" rx="1" /><rect x="3" y="16" width="6" height="5" rx="1" /><rect x="15" y="16" width="6" height="5" rx="1" /><path d="M12 8v4M6 16v-4h12v4" /></svg>;
}
// 공지 표시(확성기)
export function IconMegaphone({ size = 18, max }: P) {
  return <svg width={size} height={size} style={sz(size, max)} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10v4a1 1 0 0 0 1 1h3l10 5V4L7 9H4a1 1 0 0 0-1 1z" /><path d="M7 15l1.5 5" /><path d="M20.5 9.5a3 3 0 0 1 0 5" /></svg>;
}
// 상단 고정 표시(압정)
export function IconPin({ size = 18, max }: P) {
  return <svg width={size} height={size} style={sz(size, max)} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h6l-1 5 4 4v2H6v-2l4-4z" /><path d="M12 14v7" /></svg>;
}
// 첨부(클립)
export function IconClip({ size = 18, max }: P) {
  return <svg width={size} height={size} style={sz(size, max)} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 11.5l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" /></svg>;
}
export function IconBook({ size = 34, max }: P) {
  return <svg width={size} height={size} style={sz(size, max)} viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7a2 2 0 0 1 1 .3A2 2 0 0 1 13 4h7v15h-7a1.5 1.5 0 0 0-1 .4 1.5 1.5 0 0 0-1-.4H4z" fill="currentColor" /></svg>;
}
export function IconStar({ size = 24, max }: P) {
  return <svg width={size} height={size} style={sz(size, max)} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3 6.5 7 .8-5.2 4.8 1.5 7-6.3-3.7L5.7 21l1.5-7L2 9.3l7-.8z" fill="currentColor" /></svg>;
}
export function IconMic({ size = 26, max }: P) {
  return (
    <svg width={size} height={size} style={sz(size, max)} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v4" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}
export function IconChat({ size = 36, max }: P) {
  return <svg width={size} height={size} style={sz(size, max)} viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-8l-5 4v-4H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" fill="currentColor" /></svg>;
}
export function IconLock({ size = 36, max }: P) {
  return (
    <svg width={size} height={size} style={sz(size, max)} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="10" width="16" height="11" rx="2.5" fill="currentColor" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2.8" fill="none" />
    </svg>
  );
}
export function IconQuestion({ size = 36, max }: P) {
  return (
    <svg width={size} height={size} style={sz(size, max)} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path d="M9 9.5a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4" stroke="var(--card, #fff)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <circle cx="12" cy="18" r="1.5" fill="var(--card, #fff)" />
    </svg>
  );
}
