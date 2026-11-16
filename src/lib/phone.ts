// 휴대폰 번호: 숫자 10~11자리 → "010-1234-5678" (02 지역번호는 "02-1234-5678"). 맞지 않으면 null
export function formatPhone(input: string): string | null {
  const d = input.replace(/\D/g, "");
  if (d.length < 10 || d.length > 11) return null;
  if (d.startsWith("02")) return d.length === 10 ? `02-${d.slice(2, 6)}-${d.slice(6)}` : null;
  return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

export const phoneDigits = (p?: string) => (p ?? "").replace(/\D/g, "");
