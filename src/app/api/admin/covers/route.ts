import { NextResponse } from "next/server";
import { adminOrOfficer, bad, guard } from "@/lib/api";
import { clubParam } from "@/lib/clubs";
import { coverUrl, readCovers, removeCover, saveCover, type CoverScope } from "@/lib/covers";
import { imageTypeOf, MAX_PHOTO_BYTES, MAX_THUMB_BYTES } from "@/lib/event-photos";
import { getLists } from "@/lib/lists";

export const dynamic = "force-dynamic";

// 대표사진 관리(lib/covers.ts)
//  모임(scope=org): 모임설정 권한(group)
//  클럽(scope=club&name=): 회원정보 권한 관리자 또는 그 클럽 직책자(클럽관리 › 개요와 같은 기준)
async function access(scope: string | null, name: string | null): Promise<{ err: NextResponse } | { c: CoverScope }> {
  if (scope === "org") {
    const g = await guard("group");
    return "err" in g ? g : { c: { scope: "org" } };
  }
  if (scope === "club" && name) {
    const g = await adminOrOfficer("members");
    if ("err" in g) return g;
    const club = clubParam(name);
    if (!(await getLists()).clubs.includes(club)) return { err: bad("클럽을 찾을 수 없어요.", 404) };
    if (!g.adminOk && !g.officerOf.includes(club)) return { err: bad("내가 직책을 맡은 클럽만 관리할 수 있어요.", 403) };
    return { c: { scope: "club", name: club } };
  }
  return { err: bad("대표사진 종류를 확인해 주세요.") };
}

const view = (c: CoverScope, at: string | undefined) => ({ url: at ? coverUrl(c, at, false) : "", at: at ?? "" });

// 지금 대표사진(없으면 url "")
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const a = await access(q.get("scope"), q.get("name"));
  if ("err" in a) return a.err;
  const meta = await readCovers();
  return NextResponse.json(view(a.c, a.c.scope === "org" ? meta.org : meta.clubs[a.c.name]));
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
  return NextResponse.json(view(a.c, at));
}

// 지우기: ?scope=org | ?scope=club&name=
export async function DELETE(req: Request) {
  const q = new URL(req.url).searchParams;
  const a = await access(q.get("scope"), q.get("name"));
  if ("err" in a) return a.err;
  await removeCover(a.c);
  return NextResponse.json(view(a.c, undefined));
}
