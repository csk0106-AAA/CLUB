// 게시 기간: postFrom ~ postUntil(둘 다 비면 계속 게시). 기간 밖이면 게시판·알림에 보이지 않고, 관리자 › 게시글관리에서만 본다.
export type PeriodRow = { postFrom?: string; postUntil?: string };
const t = (s?: string) => (s ? Date.parse(s) : NaN);
export function postStatus(p: PeriodRow, now = Date.now()): "live" | "before" | "ended" {
  const f = t(p.postFrom), u = t(p.postUntil);
  if (!Number.isNaN(f) && now < f) return "before";
  if (!Number.isNaN(u) && now > u) return "ended";
  return "live";
}
export const postLive = (p: PeriodRow, now = Date.now()) => postStatus(p, now) === "live";
