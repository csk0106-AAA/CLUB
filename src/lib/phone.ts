// 휴대폰 번호: 숫자 10~11자리 → "010-1234-5678" (02 지역번호는 "02-1234-5678"). 맞지 않으면 null
export function formatPhone(input: string): string | null {
  const d = input.replace(/\D/g, "");
  if (d.length < 10 || d.length > 11) return null;
  if (d.startsWith("02")) return d.length === 10 ? `02-${d.slice(2, 6)}-${d.slice(6)}` : null;
  return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
}

export const phoneDigits = (p?: string) => (p ?? "").replace(/\D/g, "");

// 같은 번호인지 비교할 때 쓰는 값: 숫자만, 국가번호(+82)로 적은 번호는 0 으로 시작하게 바꾼다
//  "+82 10-1234-5678", "82-010-1234-5678" → "01012345678"
export function phoneKey(p?: string): string {
  const d = phoneDigits(p);
  if (d.startsWith("82") && d.length >= 11) {
    const rest = d.slice(2);
    return rest.startsWith("0") ? rest : `0${rest}`;
  }
  return d;
}

// 입력하는 동안 하이픈 넣기: 숫자만 쳐도 "010-0000-0000"(02 지역번호는 "02-000-0000"/"02-0000-0000")
export function typePhone(input: string): string {
  const d = input.replace(/\D/g, "").slice(0, 11);
  if (d.startsWith("02")) {
    const n = d.slice(0, 10);
    if (n.length <= 2) return n;
    if (n.length <= 5) return `02-${n.slice(2)}`;
    if (n.length <= 9) return `02-${n.slice(2, 5)}-${n.slice(5)}`;
    return `02-${n.slice(2, 6)}-${n.slice(6)}`;
  }
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  // 010 이 아닌 10자리(011-123-4567 등)는 3-3-4
  if (d.length === 10 && !d.startsWith("010")) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

// 저장할 때: 형식에 맞으면 하이픈 넣은 모양으로, 아니면 적은 그대로
export const tidyPhone = (p: string): string => formatPhone(p) ?? formatPhone(phoneKey(p)) ?? p.trim();
