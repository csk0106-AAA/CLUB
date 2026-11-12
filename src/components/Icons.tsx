// 목업 9안의 아이콘. 글자색(currentColor)을 따른다.
type P = { size?: number };

export function IconHome({ size = 26 }: P) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" fill="currentColor" /></svg>;
}
export function IconProfileBook({ size = 26 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 2h12a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="currentColor" />
      <circle cx="12" cy="9" r="3" fill="#fff" />
      <path d="M6.8 16.5c.5-2.6 2.5-3.8 5.2-3.8s4.7 1.2 5.2 3.8z" fill="#fff" />
      <path d="M2 6h3M2 10h3M2 14h3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
export function IconGear({ size = 26 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4M4.5 4.5l2.8 2.8M16.7 16.7l2.8 2.8M19.5 4.5l-2.8 2.8M7.3 16.7l-2.8 2.8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
export function IconBook({ size = 34 }: P) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7a2 2 0 0 1 1 .3A2 2 0 0 1 13 4h7v15h-7a1.5 1.5 0 0 0-1 .4 1.5 1.5 0 0 0-1-.4H4z" fill="currentColor" /></svg>;
}
export function IconStar({ size = 24 }: P) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3 6.5 7 .8-5.2 4.8 1.5 7-6.3-3.7L5.7 21l1.5-7L2 9.3l7-.8z" fill="currentColor" /></svg>;
}
export function IconMic({ size = 26 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v4" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}
export function IconChat({ size = 36 }: P) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-8l-5 4v-4H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" fill="currentColor" /></svg>;
}
export function IconLock({ size = 36 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="10" width="16" height="11" rx="2.5" fill="currentColor" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2.8" fill="none" />
    </svg>
  );
}
export function IconQuestion({ size = 36 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path d="M9 9.5a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <circle cx="12" cy="18" r="1.5" fill="#fff" />
    </svg>
  );
}
