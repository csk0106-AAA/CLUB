import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, parseJson } from "@/lib/api";
import { MAX_CAPTION, photoAccess, photoView } from "@/lib/event-photos";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; pid: string }> };

async function photoOf(ctx: Ctx) {
  const a = await photoAccess(ctx);
  if ("err" in a) return a;
  const { pid } = await ctx.params;
  const store = await getStore();
  const p = await store.get("EventPhotos", pid);
  if (!p || p.eventId !== a.e.id) return { err: bad("사진을 찾을 수 없어요.", 404) };
  return { ...a, p, store };
}

// 사진 보기: ?size=thumb(미리보기) / 없으면 줄인 원본. ?dl=1 이면 파일로 내려받기.
export async function GET(req: Request, ctx: Ctx) {
  const r = await photoOf(ctx);
  if ("err" in r) return r.err;
  const d = await r.store.get("EventPhotoData", r.p.id);
  if (!d) return bad("사진을 찾을 수 없어요.", 404);
  const q = new URL(req.url).searchParams;
  const thumb = q.get("size") === "thumb";
  const body = Buffer.from((thumb ? d.thumb : d.data) ?? "", "base64");
  const type = thumb ? "image/jpeg" : d.type || "image/jpeg";
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const day = (r.e.startsAt ?? "").slice(0, 10).replace(/-/g, "");
  return new NextResponse(body, {
    headers: {
      "Content-Type": type,
      "Content-Length": String(body.length),
      "Content-Disposition": q.get("dl") ? `attachment; filename="photo-${day || "event"}-${r.p.id.slice(0, 8)}.${ext}"` : "inline",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      // 사진은 올린 뒤 바뀌지 않는다
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
}

const patchSchema = z.object({ like: z.boolean().optional(), caption: z.string().max(MAX_CAPTION * 2).optional() });

// 좋아요 켜고 끄기(보는 회원 누구나) · 설명 고치기(올린 사람·관리자)
export async function PATCH(req: Request, ctx: Ctx) {
  const r = await photoOf(ctx);
  if ("err" in r) return r.err;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("요청 형식이 맞지 않아요.");
  const patch: Record<string, string> = {};
  if (parsed.data.like !== undefined && !r.canUpload) return bad("참석 신청한 회원만 좋아요를 누를 수 있어요.", 403);
  if (parsed.data.like !== undefined) {
    const likes = new Set(parseJson<string[]>(r.p.likes, []));
    if (parsed.data.like) likes.add(r.s.mid);
    else likes.delete(r.s.mid);
    patch.likes = JSON.stringify([...likes]);
  }
  if (parsed.data.caption !== undefined) {
    if (r.p.memberId !== r.s.mid && !r.manager) return bad("올린 사람만 설명을 고칠 수 있어요.", 403);
    patch.caption = parsed.data.caption.replace(/[\r\n\t]+/g, " ").trim().slice(0, MAX_CAPTION);
  }
  const store = await getStore();
  const row = (await store.update("EventPhotos", r.p.id, patch)) ?? r.p;
  const members = await store.list("Members");
  return NextResponse.json({ photo: photoView(row, r.s.mid, (mid) => members.find((m) => m.id === mid)?.name ?? "") });
}

// 사진 지우기: 올린 사람 또는 일정 관리자
export async function DELETE(_req: Request, ctx: Ctx) {
  const r = await photoOf(ctx);
  if ("err" in r) return r.err;
  if (r.p.memberId !== r.s.mid && !r.manager) return bad("올린 사람이나 일정 관리자만 지울 수 있어요.", 403);
  await r.store.remove("EventPhotoData", r.p.id);
  await r.store.remove("EventPhotos", r.p.id);
  // 이 사진의 댓글도 함께
  for (const c of (await r.store.list("PhotoComments")).filter((x) => x.photoId === r.p.id)) await r.store.remove("PhotoComments", c.id);
  return NextResponse.json({ ok: true });
}
