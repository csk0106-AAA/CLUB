import { neon } from "@neondatabase/serverless";
import { parseJson } from "./api";
import { getStore } from "./store";
import type { Row } from "./store/types";

// 프로필 사진(서버). Members.avatar 에 {type:"character", key} | {type:"photo", fileId} JSON 을 둔다.
// 사진 내용은 MemberPhotos 에 base64 로 따로 둔다(256×256 으로 줄여서 올린다).
// 화면에는 avatarView 로 바꿔 내려준다: 사진은 /api/avatar/<회원 id>?v=<사진 id> (바꾸면 주소가 달라져 캐시가 새로 받는다).

export const AVATAR_KEYS = ["sprout", "bear", "cat", "fox", "owl", "penguin", "rabbit", "whale"] as const;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export type StoredAvatar = { type: "character"; key: string } | { type: "photo"; fileId: string };
export type AvatarView = { type: "character"; key: string } | { type: "photo"; src: string } | null;

export function readAvatar(raw: string | undefined): StoredAvatar | null {
  const a = parseJson<Partial<StoredAvatar> | null>(raw, null);
  if (!a || typeof a !== "object") return null;
  if (a.type === "character" && typeof a.key === "string" && (AVATAR_KEYS as readonly string[]).includes(a.key)) return { type: "character", key: a.key };
  if (a.type === "photo" && typeof a.fileId === "string" && a.fileId) return { type: "photo", fileId: a.fileId };
  return null;
}

export function avatarView(m: { id?: string; avatar?: string }): AvatarView {
  const a = readAvatar(m.avatar);
  if (!a || !m.id) return null;
  if (a.type === "character") return a;
  return { type: "photo", src: `/api/avatar/${encodeURIComponent(m.id)}?v=${encodeURIComponent(a.fileId)}` };
}

// 파일 앞부분(매직 넘버)으로 정말 그 형식인지 확인한다.
export function photoTypeOf(b: Uint8Array): (typeof PHOTO_TYPES)[number] | null {
  const at = (i: number, ...v: number[]) => v.every((x, j) => b[i + j] === x);
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

// 사진 한 장 읽기: 모든 사진(base64)을 한꺼번에 읽지 않도록 DB 에서는 id 로 바로 찾는다.
let sql: ReturnType<typeof neon> | null = null;
export async function getPhotoRow(id: string): Promise<Row | null> {
  const s = await getStore();
  const url = process.env.DATABASE_URL;
  if (url) {
    sql ??= neon(url);
    const rows = (await sql.query(`SELECT data FROM app_rows WHERE tab = 'MemberPhotos' AND id = $1`, [id])) as { data: Row }[];
    return rows[0]?.data ?? null;
  }
  return (await s.list("MemberPhotos")).find((r) => r.id === id) ?? null;
}

// 이 회원의 사진 행을 모두 지운다(keep 은 남길 사진 id). 사진을 바꾸거나 캐릭터·기본으로 돌릴 때 쓴다.
export async function removeMemberPhotos(memberId: string, keep?: string): Promise<void> {
  const s = await getStore();
  const url = process.env.DATABASE_URL;
  if (url) {
    sql ??= neon(url);
    await sql.query(
      `DELETE FROM app_rows WHERE tab = 'MemberPhotos' AND data->>'memberId' = $1 AND id <> $2`,
      [memberId, keep ?? ""],
    );
    return;
  }
  for (const r of await s.list("MemberPhotos")) if (r.memberId === memberId && r.id !== keep) await s.remove("MemberPhotos", r.id);
}
