// 날짜 고르기(DateField)가 저장하는 "YYYY-MM-DDTHH:mm"·"YYYY-MM-DD" 는 시간대가 없는 한국 시간이다.
// 서버(Vercel)는 UTC 라서 그냥 Date.parse 하면 9시간 늦게 읽는다 → 시간대가 없으면 +09:00 으로 읽는다.
export function kstTime(s?: string | null): number {
  if (!s) return NaN;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Date.parse(`${s}T00:00:00+09:00`);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return Date.parse(`${s}:00+09:00`);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s)) return Date.parse(`${s}+09:00`);
  return Date.parse(s);
}
