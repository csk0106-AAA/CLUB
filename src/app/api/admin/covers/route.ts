import { NextResponse } from "next/server";
import { bad } from "@/lib/api";
import { coverId, coverUrl, readCovers, removeCover, saveCover, setCoverFocus, type CoverScope } from "@/lib/covers";
import { imageTypeOf, MAX_PHOTO_BYTES, MAX_THUMB_BYTES } from "@/lib/event-photos";
import { getStore } from "@/lib/store";
import { coverAccess as access } from "@/lib/cover-access";

export const dynamic = "force-dynamic";

// 대표사진 관리(lib/covers.ts)
//  모임(scope=org): 모임설정 권한(group)
//  클럽(scope=club&name=): 회원정보 권한 관리자 또는 그 클럽 직책자(클럽관리 › 개요와 같은 기준)

// url 끝에 중심점(#f=x,y)이 붙고, focus 로도 따로 준다
const view = async (c: CoverScope, at: string | undefined) => {
  const focus = (await readCovers()).focus[coverId(c)] ?? "50,50";
  return { url: at ? coverUrl(c, at, false, focus) : "", at: at ?? "", focus };
};

// 지금 대표사진(없으면 url "")
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const a = await access(q.get("scope"), q.get("name"));
  if ("err" in a) return a.err;
  if (a.c.scope === "event") return NextResponse.json(await view(a.c, (await (await getStore()).get("Events", a.c.id))?.coverAt || undefined));
  const meta = await readCovers();
  return NextResponse.json(await view(a.c, a.c.scope === "org" ? meta.org : meta.clubs[a.c.name]));
}

// 올리기·바꾸기 (multipart/form-data): scope, name(클럽), file(긴 변 1600px), thumb(400px). 화면에서 줄여 올린다.
export async function POST(req: Request) {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_PHOTO_BYTES + MAX_THUMB_BYTES + 64 * 1024) return bad("사진이 너무 커요.", 413);
  const form = await req.formData().catch(() => null);
  const a = await access(String(form?.get("scope") ?? ""), form?.get("name") ? String(form.get("name")) : null);
  if ("err" in a) return a.err;
  const f = form?.get("file");
  const t = form?.get("thumb");
  if (!f || typeof f === "string" || !t || typeof t === "string") return bad("사진을 골라 주세요.");
  if (f.size === 0 || t.size === 0) return bad("빈 파일이에요.");
  if (f.size > MAX_PHOTO_BYTES || t.size > MAX_THUMB_BYTES) return bad("사진이 너무 커요.", 413);
  const buf = Buffer.from(await f.arrayBuffer());
  const tbuf = Buffer.from(await t.arrayBuffer());
  const type = imageTypeOf(buf);
  if (!type || !imageTypeOf(tbuf)) return bad("jpg, png, webp 사진만 올릴 수 있어요.");
  const at = await saveCover(a.c, type, buf, tbuf);
  return NextResponse.json(await view(a.c, at));
}

// 지우기: ?scope=org | ?scope=club&name=
export async function DELETE(req: Request) {
  const q = new URL(req.url).searchParams;
  const a = await access(q.get("scope"), q.get("name"));
  if ("err" in a) return a.err;
  await removeCover(a.c);
  return NextResponse.json(await view(a.c, undefined));
}

// 보일 중심점 바꾸기: { scope, name?, focus: { x, y } } (0~100 %)
export async function PATCH(req: Request) {
  const b = (await req.json().catch(() => null)) as { scope?: string; name?: string; focus?: { x?: unknown; y?: unknown } } | null;
  const a = await access(b?.scope ?? null, b?.name ?? null);
  if ("err" in a) return a.err;
  const x = Number(b?.focus?.x);
  const y = Number(b?.focus?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) return bad("중심점을 확인해 주세요.");
  await setCoverFocus(a.c, `${Math.round(x)},${Math.round(y)}`);
  const at = a.c.scope === "event" ? (await (await getStore()).get("Events", a.c.id))?.coverAt || undefined : a.c.scope === "org" ? (await readCovers()).org : (await readCovers()).clubs[a.c.name];
  return NextResponse.json(await view(a.c, at));
}
