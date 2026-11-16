// 연령대: 생년월일(YYYY-MM-DD 또는 YYYYMMDD, YYYY.MM.DD)로 오늘(한국 시간) 기준 만 나이를 구해 "50대"처럼 만든다.
// 생년월일이 없거나 읽을 수 없으면 "" (그때는 관리자가 직접 적은 연령대를 쓴다).
export function ageGroupOf(birth: string | undefined, now: Date = new Date()): string {
  const m = (birth ?? "").trim().match(/^(\d{4})[-./]?(\d{1,2})[-./]?(\d{1,2})/);
  if (!m) return "";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1900 || mo < 1 || mo > 12 || d < 1 || d > 31) return "";
  const kst = new Date(now.getTime() + 9 * 3600_000);
  const [ty, tm, td] = [kst.getUTCFullYear(), kst.getUTCMonth() + 1, kst.getUTCDate()];
  const age = ty - y - (tm < mo || (tm === mo && td < d) ? 1 : 0);
  if (age < 0 || age > 120) return "";
  return `${Math.floor(age / 10) * 10}대`;
}

// 회원의 연령대: 생년월일이 있으면 늘 생년월일로 계산(해가 바뀌어도 맞게), 없으면 저장된 값
export const memberAgeGroup = (m: { birth?: string; ageGroup?: string }): string => ageGroupOf(m.birth) || (m.ageGroup ?? "");
