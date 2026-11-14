import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { avatarView, MAX_PHOTO_BYTES, photoTypeOf, removeMemberPhotos } from "@/lib/avatar";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const TOO_BIG = "사진은 2MB까지 올릴 수 있어요.";

// 프로필 사진 올리기 (multipart/form-data, 필드 이름 "file"). jpg·png·webp, 2MB까지.
// 화면에서 256×256 으로 잘라 줄인 뒤(위치 정보 등 EXIF 없이) 올린다. 올리면 예전 사진은 지운다.
export async function POST(req: Request) {
  const g = await guard();
  if ("err" in g) return g.err;
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_PHOTO_BYTES + 64 * 1024) return bad(TOO_BIG, 413);
  const form = await req.formData().catch(() => null);
  const f = form?.get("file");
  if (!f || typeof f === "string") return bad("사진을 골라 주세요.");
  if (f.size === 0) return bad("빈 파일이에요.");
  if (f.size > MAX_PHOTO_BYTES) return bad(TOO_BIG, 413);
  const buf = new Uint8Array(await f.arrayBuffer());
  const type = photoTypeOf(buf);
  if (!type) return bad("jpg, png, webp 사진만 올릴 수 있어요. 사진 파일이 아니거나 손상된 파일이에요.");
  const s = await getStore();
  const me = (await s.list("Members")).find((m) => m.id === g.s.mid);
  if (!me) return bad("회원 정보를 찾을 수 없어요.", 404);
  const row = await s.insert("MemberPhotos", {
    memberId: me.id, type, size: String(buf.length), data: Buffer.from(buf).toString("base64"), createdAt: new Date().toISOString(),
  });
  const avatar = JSON.stringify({ type: "photo", fileId: row.id });
  await s.update("Members", me.id, { avatar });
  await removeMemberPhotos(me.id, row.id);
  return NextResponse.json({ avatar: avatarView({ id: me.id, avatar }) });
}
