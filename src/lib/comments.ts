import { parseJson } from "./api";
import type { Row } from "./store/types";

// 댓글 공통(게시글 댓글 PostComments · 사진 댓글 PhotoComments)
//  likes: 좋아요 누른 회원 id 배열 JSON, parentId: 답글이면 원댓글 id(답글의 답글은 원댓글 아래로 모은다 = 한 단계)
export const likesOf = (c: Row): string[] => parseJson<string[]>(c.likes, []);

// 답글을 달 원댓글 id: 답글에 답하면 그 답글의 원댓글로 모은다. 없거나 다른 글의 댓글이면 null
export function replyParent(all: Row[], parentId: string | undefined, sameThread: (c: Row) => boolean): string | null | false {
  if (!parentId) return null;
  const p = all.find((c) => c.id === parentId && sameThread(c));
  if (!p) return false;
  return p.parentId || p.id;
}

// 좋아요 켜고 끄기(회원 id 목록을 돌려준다)
export function toggleLike(c: Row, mid: string, on?: boolean): string[] {
  const ls = likesOf(c);
  const has = ls.includes(mid);
  const want = on ?? !has;
  return want ? (has ? ls : [...ls, mid]) : ls.filter((x) => x !== mid);
}

// 화면 순서: 원댓글은 오래된 것부터, 답글은 원댓글 바로 아래(오래된 것부터)
export function threadOrder(rows: Row[]): Row[] {
  const byTime = (a: Row, b: Row) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
  const ids = new Set(rows.map((r) => r.id));
  const tops = rows.filter((r) => !r.parentId || !ids.has(r.parentId)).sort(byTime);
  return tops.flatMap((t) => [t, ...rows.filter((r) => r.parentId === t.id).sort(byTime)]);
}
