import { api } from "./client";

// 소모임 목록(Settings "clubs") 바꾸기: 소모임관리에서 추가 · 이름 바꾸기 · 삭제.
// 서버(/api/admin/lists, 회원정보 권한)가 회원 명단·기본 정보·회비·일정·신청내역에 이름 변경/삭제를 함께 반영한다.
type Res = { ok: true; moved: number } | { ok: false; error: string };

async function change(edit: (cur: string[]) => { value: string; from?: string }[]): Promise<Res> {
  const g = await api<{ clubs: string[] }>("/api/admin/lists");
  if (!g.ok) return { ok: false, error: g.error };
  const r = await api<{ moved: number }>("/api/admin/lists", { method: "PUT", body: { list: "clubs", items: edit(g.data.clubs) } });
  return r.ok ? { ok: true, moved: r.data.moved } : { ok: false, error: r.error };
}

export const addClub = (name: string) =>
  change((cur) => [...cur.map((v) => ({ value: v, from: v })), { value: name }]);

export const renameClub = (from: string, to: string) =>
  change((cur) => cur.map((v) => ({ value: v === from ? to : v, from: v })));

export const removeClub = (name: string) =>
  change((cur) => cur.filter((v) => v !== name).map((v) => ({ value: v, from: v })));
