import { NextResponse } from "next/server";
import { bad } from "@/lib/api";
import {
  imageTypeOf, limitMessage, MAX_CAPTION, MAX_MEMBER_PHOTOS, MAX_PHOTO_BYTES, MAX_THUMB_BYTES, goingOf, photoAccess, photoLimitOf, photoView, readPhotoReqs,
} from "@/lib/event-photos";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// 일정 사진첩 목록(사진 내용은 /photos/[pid] 로 따로 읽는다). 회원 일정 화면과 일정관리·클럽관리 › 일정이 함께 쓴다.
export async function GET(_req: Request, ctx: Ctx) {
  const a = await photoAccess(ctx);
  if ("err" in a) return a.err;
  const s = await getStore();
  const [rows, members] = await Promise.all([s.list("EventPhotos"), s.list("Members")]);
  const nameOf = (mid: string) => members.find((m) => m.id === mid)?.name ?? "알 수 없음";
  const photos = rows
    .filter((r) => r.eventId === a.e.id)
    .sort((p, q) => (q.createdAt ?? "").localeCompare(p.createdAt ?? ""))
    .map((r) => photoView(r, a.s.mid, nameOf));
  // max: 이 일정의 최대 장수, requested: 내가 이미 장수 늘리기를 요청했는지(관리자가 처리하면 비워진다)
  const requested = readPhotoReqs(a.e.photoReqs).some((r) => r.memberId === a.s.mid);
  return NextResponse.json({ photos, canUpload: a.canUpload, manager: a.manager, attending: a.attending, max: photoLimitOf(a.e, await goingOf(a.e.id)), requested });
}

// 사진 한 장 올리기 (multipart/form-data): file(줄인 사진), thumb(미리보기), caption, w, h
export async function POST(req: Request, ctx: Ctx) {
  const a = await photoAccess(ctx);
  if ("err" in a) return a.err;
  if (!a.canUpload) return bad("참석 신청한 회원만 사진을 올릴 수 있어요.", 403);
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_PHOTO_BYTES + MAX_THUMB_BYTES + 64 * 1024) return bad("사진이 너무 커요.", 413);
  const s = await getStore();
  const mine = (await s.list("EventPhotos")).filter((r) => r.eventId === a.e.id);
  // 일정의 최대 장수(관리자 설정, 없으면 참석 인원 × 10장 × 일수). 넘으면 화면이 "관리자 요청"을 띄우도록 limit: true
  const limit = photoLimitOf(a.e, await goingOf(a.e.id));
  if (mine.length >= limit) return NextResponse.json({ error: limitMessage(limit), limit: true, max: limit }, { status: 409 });
  if (!a.manager && mine.filter((r) => r.memberId === a.s.mid).length >= MAX_MEMBER_PHOTOS) return bad(`한 사람이 일정 하나에 ${MAX_MEMBER_PHOTOS}장까지 올릴 수 있어요.`);

  const form = await req.formData().catch(() => null);
  const f = form?.get("file");
  const t = form?.get("thumb");
  if (!f || typeof f === "string" || !t || typeof t === "string") return bad("사진을 골라 주세요.");
  if (f.size === 0 || t.size === 0) return bad("빈 파일이에요.");
  if (f.size > MAX_PHOTO_BYTES || t.size > MAX_THUMB_BYTES) return bad("사진이 너무 커요.", 413);
  const buf = new Uint8Array(await f.arrayBuffer());
  const tbuf = new Uint8Array(await t.arrayBuffer());
  const type = imageTypeOf(buf);
  if (!type || !imageTypeOf(tbuf)) return bad("jpg, png, webp 사진만 올릴 수 있어요.");
  const caption = String(form?.get("caption") ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, MAX_CAPTION);
  const dim = (k: string) => String(Math.max(0, Math.min(10000, Math.round(Number(form?.get(k)) || 0))));

  const row = await s.insert("EventPhotos", {
    eventId: a.e.id, memberId: a.s.mid, caption, w: dim("w"), h: dim("h"), size: String(buf.length), likes: "[]", createdAt: new Date().toISOString(),
  });
  await s.insert("EventPhotoData", { id: row.id, type, data: Buffer.from(buf).toString("base64"), thumb: Buffer.from(tbuf).toString("base64") });
  return NextResponse.json({ photo: photoView(row, a.s.mid, () => a.s.name) });
}
