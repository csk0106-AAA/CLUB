import { getSetting, getStore, setSetting } from "./store";

// 대표사진: 일정에 회원이 올린 사진이 한 장도 없을 때 일정 카드(홈 다가오는 일정·타임라인·달력)에 보이는 사진.
//  - 모임 대표사진: 관리자 › 모임설정 (권한 group)
//  - 클럽 대표사진: 클럽관리 › 클럽 › 개요 (회원정보 권한 관리자 또는 그 클럽 직책자). 클럽 일정은 클럽 대표사진이 먼저.
//  - 일정 대표사진: 관리자 › 일정 관리 › 개요 (그 일정을 관리하는 사람). 있으면 회원 사진보다 먼저, 그 일정 카드·상세 맨 위에 보인다.
//    올린 시각은 그 일정의 coverAt 에 둔다.
// 사진 내용은 CoverData(id "org" | "club:<이름>"), 등록 여부·바뀐 시각은 Settings "covers" = { org?: 시각, clubs: { [이름]: 시각 } }.
// 클럽 이름을 바꾸거나 지우면 함께 옮기거나 지운다(api/admin/lists).

export type CoverMeta = { org?: string; clubs: Record<string, string> };
export type CoverScope = { scope: "org" } | { scope: "club"; name: string } | { scope: "event"; id: string };

export const coverId = (c: CoverScope) => (c.scope === "org" ? "org" : c.scope === "club" ? `club:${c.name}` : `event:${c.id}`);

export async function readCovers(): Promise<CoverMeta> {
  const v = await getSetting<Partial<CoverMeta>>("covers", {});
  return { org: typeof v?.org === "string" ? v.org : undefined, clubs: v?.clubs && typeof v.clubs === "object" ? v.clubs : {} };
}

// 화면에서 쓰는 주소(바뀐 시각을 붙여 예전 사진이 캐시에 남지 않게)
export function coverUrl(c: CoverScope, at: string, thumb = true): string {
  const q = new URLSearchParams(c.scope === "org" ? { scope: "org" } : c.scope === "club" ? { scope: "club", name: c.name } : { scope: "event", id: c.id });
  if (thumb) q.set("size", "thumb");
  q.set("v", at);
  return `/api/covers?${q.toString()}`;
}

// 일정 대표사진 주소(없으면 "")
export const eventCoverUrl = (e: { id: string; coverAt?: string }, thumb = true): string => (e.coverAt ? coverUrl({ scope: "event", id: e.id }, e.coverAt, thumb) : "");

// 이 일정의 대표사진 주소(없으면 ""): 클럽 일정은 클럽 대표사진 → 모임 대표사진, 그 밖은 모임 대표사진
export function defaultCoverUrl(meta: CoverMeta, club: string | undefined, thumb = true): string {
  const c = (club ?? "").trim();
  if (c && meta.clubs[c]) return coverUrl({ scope: "club", name: c }, meta.clubs[c], thumb);
  return meta.org ? coverUrl({ scope: "org" }, meta.org, thumb) : "";
}

export async function saveCover(c: CoverScope, type: string, data: Buffer, thumb: Buffer): Promise<string> {
  const s = await getStore();
  const id = coverId(c);
  const at = new Date().toISOString();
  const row = { type, data: data.toString("base64"), thumb: thumb.toString("base64"), updatedAt: at };
  if (await s.get("CoverData", id)) await s.update("CoverData", id, row);
  else await s.insert("CoverData", { id, ...row });
  if (c.scope === "event") {
    await s.update("Events", c.id, { coverAt: at });
    return at;
  }
  const meta = await readCovers();
  if (c.scope === "org") meta.org = at;
  else if (c.scope === "club") meta.clubs = { ...meta.clubs, [c.name]: at };
  await setSetting("covers", meta);
  return at;
}

export async function removeCover(c: CoverScope): Promise<void> {
  await (await getStore()).remove("CoverData", coverId(c));
  if (c.scope === "event") {
    await (await getStore()).update("Events", c.id, { coverAt: "" });
    return;
  }
  const meta = await readCovers();
  if (c.scope === "org") delete meta.org;
  else if (c.scope === "club") delete meta.clubs[c.name];
  await setSetting("covers", meta);
}

// 클럽 이름 바꾸기·지우기에 맞춰 클럽 대표사진을 옮기거나 지운다
export async function syncClubCovers(renames: Map<string, string>, deleted: string[]): Promise<void> {
  const meta = await readCovers();
  const s = await getStore();
  let changed = false;
  for (const name of deleted) {
    if (!meta.clubs[name]) continue;
    await s.remove("CoverData", `club:${name}`);
    delete meta.clubs[name];
    changed = true;
  }
  for (const [from, to] of renames) {
    if (!meta.clubs[from]) continue;
    const row = await s.get("CoverData", `club:${from}`);
    if (row) {
      await s.insert("CoverData", { ...row, id: `club:${to}` });
      await s.remove("CoverData", `club:${from}`);
    }
    meta.clubs[to] = meta.clubs[from];
    delete meta.clubs[from];
    changed = true;
  }
  if (changed) await setSetting("covers", meta);
}
