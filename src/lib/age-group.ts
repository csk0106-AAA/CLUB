// 생년월일 읽기: 여러 모양을 "YYYY-MM-DD"로 맞춘다. 읽을 수 없으면 "".
//  1970-01-01 · 1970.1.1 · 1970/01/01 · 19700101 · 1970년 1월 1일 · 70.01.01 · 700101 · 1970-01-01T00:00 …
//  두 자리 연도는 올해 끝 두 자리보다 크면 1900년대, 아니면 2000년대로 본다.
export function normBirth(birth: string | undefined, now: Date = new Date()): string {
  const s = (birth ?? "").trim().replace(/\s+/g, "");
  if (!s) return "";
  const pats = [/^(\d{4})[-./년]?(\d{1,2})[-./월]?(\d{1,2})/, /^(\d{2})[-./년](\d{1,2})[-./월](\d{1,2})/, /^(\d{2})(\d{2})(\d{2})$/];
  const thisYear = new Date(now.getTime() + 9 * 3600_000).getUTCFullYear();
  for (const p of pats) {
    const m = s.match(p);
    if (!m) continue;
    let y = Number(m[1]);
    if (m[1].length === 2) y += y > thisYear % 100 ? 1900 : 2000;
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (y < 1900 || y > thisYear || mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return "";
}

// 연령대: 생년월일로 오늘(한국 시간) 기준 만 나이를 구해 "50대"처럼 만든다.
// 생년월일이 없거나 읽을 수 없으면 "" (그때는 관리자가 직접 적은 연령대를 쓴다).
export function ageGroupOf(birth: string | undefined, now: Date = new Date()): string {
  const b = normBirth(birth, now);
  if (!b) return "";
  const [y, mo, d] = b.split("-").map(Number);
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const [ty, tm, td] = [kst.getUTCFullYear(), kst.getUTCMonth() + 1, kst.getUTCDate()];
  const age = ty - y - (tm < mo || (tm === mo && td < d) ? 1 : 0);
  if (age < 0 || age > 120) return "";
  return `${Math.floor(age / 10) * 10}대`;
}

// 회원의 연령대: 생년월일이 있으면 늘 생년월일로 계산(해가 바뀌어도 맞게), 없으면 저장된 값
export const memberAgeGroup = (m: { birth?: string; ageGroup?: string }): string => ageGroupOf(m.birth) || (m.ageGroup ?? "");

// 저장할 생년월일: 읽을 수 있으면 "YYYY-MM-DD", 아니면 적은 그대로
export const tidyBirth = (b: string | undefined): string => normBirth(b) || (b ?? "").trim();
