import { NextResponse } from "next/server";
import { bad, parseJson } from "@/lib/api";
import { coverAccess } from "@/lib/cover-access";
import { coverId, coverUrl, readCovers, saveCover, type CoverScope } from "@/lib/covers";
import { getStore } from "@/lib/store";
import type { Row } from "@/lib/store/types";

export const dynamic = "force-dynamic";

// 대표사진을 "회원이 올린 사진"에서 고르기
//  일정 대표사진: 그 일정 사진첩 / 클럽 대표사진: 그 클럽 일정들의 사진 / 모임 대표사진: 모든 일정의 사진
//  GET ?scope&name            → 고를 수 있는 사진 목록(좋아요 많은 순 → 최근 순, 최대 120장)
//  GET ?scope&name&thumb=사진id → 그 사진의 미리보기(목록에 있는 사진만)
//  POST { scope, name, photoId } → 그 사진을 대표사진으로(사진을 복사해 저장한다. 회원이 사진을 지워도 대표사진은 남는다)
const LIMIT = 120;

async function candidates(c: CoverScope): Promise<{ photos: Row[]; events: Map<string, Row> }> {
  const s = await getStore();
  const events = (await s.list("Events")).filter((e) => (c.scope === "event" ? e.id === c.id : c.scope === "club" ? (e.club ?? "").trim() === c.name : true));
  const ids = new Set(events.map((e) => e.id));
  const photos = (await s.list("EventPhotos"))
    .filter((p) => ids.has(p.eventId))
    .sort((a, b) => parseJson<string[]>(b.likes, []).length - parseJson<string[]>(a.likes, []).length || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, LIMIT);
  return { photos, events: new Map(events.map((e) => [e.id, e])) };
}

const scopeQ = (c: CoverScope) => (c.scope === "org" ? "scope=org" : `scope=${c.scope}&name=${encodeURIComponent(c.scope === "club" ? c.name : c.id)}`);

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const a = await coverAccess(q.get("scope"), q.get("name"));
  if ("err" in a) return a.err;
  const { photos, events } = await candidates(a.c);
  const thumb = q.get("thumb");
  if (thumb) {
    if (!photos.some((p) => p.id === thumb)) return bad("사진을 찾을 수 없어요.", 404);
    const d = await (await getStore()).get("EventPhotoData", thumb);
    if (!d) return bad("사진을 찾을 수 없어요.", 404);
    const body = Buffer.from(d.thumb ?? "", "base64");
    return new NextResponse(body, {
      headers: { "Content-Type": "image/jpeg", "Content-Length": String(body.length), "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=86400, immutable" },
    });
  }
  return NextResponse.json({
    photos: photos.map((p) => ({
      id: p.id,
      eventName: events.get(p.eventId)?.name ?? "",
      likes: parseJson<string[]>(p.likes, []).length,
      url: `/api/admin/covers/photos?${scopeQ(a.c)}&thumb=${p.id}`,
    })),
  });
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { scope?: string; name?: string; photoId?: string } | null;
  const a = await coverAccess(b?.scope ?? null, b?.name ?? null);
  if ("err" in a) return a.err;
  const { photos } = await candidates(a.c);
  if (!b?.photoId || !photos.some((p) => p.id === b.photoId)) return bad("고를 수 있는 사진이 아니에요.", 404);
  const d = await (await getStore()).get("EventPhotoData", b.photoId);
  if (!d?.data || !d.thumb) return bad("사진을 찾을 수 없어요.", 404);
  const at = await saveCover(a.c, d.type || "image/jpeg", Buffer.from(d.data, "base64"), Buffer.from(d.thumb, "base64"));
  const focus = (await readCovers()).focus[coverId(a.c)] ?? "50,50";
  return NextResponse.json({ url: coverUrl(a.c, at, false, focus), at, focus });
}
