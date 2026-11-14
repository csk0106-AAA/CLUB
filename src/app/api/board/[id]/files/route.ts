import { NextResponse } from "next/server";
import { bad } from "@/lib/api";
import { checkFileType, MAX_FILE_BYTES, MAX_FILES, type FileMeta } from "@/lib/board";
import { getStore } from "@/lib/store";
import { canEdit, canSee, findPost, forbid, getMe, readFiles } from "../../_lib/server";

export const dynamic = "force-dynamic";

// 이미지가 정말 그 형식인지 앞부분(매직 넘버)으로 한 번 더 확인한다.
function looksLike(type: string, b: Uint8Array): boolean {
  const at = (i: number, ...v: number[]) => v.every((x, j) => b[i + j] === x);
  if (type === "image/jpeg") return at(0, 0xff, 0xd8, 0xff);
  if (type === "image/png") return at(0, 0x89, 0x50, 0x4e, 0x47);
  if (type === "image/gif") return at(0, 0x47, 0x49, 0x46, 0x38);
  if (type === "image/webp") return at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50);
  return true;
}

// 첨부 올리기 (multipart/form-data, 필드 이름 "file"). 한 파일 4MB, 글 하나에 10개까지.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const m = await getMe();
  if ("err" in m) return m.err;
  const p = await findPost((await ctx.params).id);
  if (!p || !canSee(m.me, p)) return bad("글을 찾을 수 없어요.", 404);
  if (!canEdit(m.me, p)) return forbid("작성자나 관리자만 파일을 올릴 수 있어요.");
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_FILE_BYTES + 64 * 1024) return bad("파일은 하나에 4MB까지 올릴 수 있어요.", 413);
  const files = readFiles(p);
  if (files.length >= MAX_FILES) return bad(`파일은 글 하나에 ${MAX_FILES}개까지 올릴 수 있어요.`);
  const form = await req.formData().catch(() => null);
  const f = form?.get("file");
  if (!f || typeof f === "string") return bad("파일을 골라 주세요.");
  if (f.size === 0) return bad("빈 파일이에요.");
  if (f.size > MAX_FILE_BYTES) return bad("파일은 하나에 4MB까지 올릴 수 있어요.", 413);
  const name = (f.name || "file").replace(/[\\/\r\n\t\0"]/g, "_").slice(-120);
  const kind = checkFileType(name, f.type);
  if (!kind) return bad("올릴 수 없는 파일 형식이에요. 사진(jpg, png, webp, gif)이나 문서(pdf, 오피스, hwp, zip, txt)만 올릴 수 있어요.");
  const buf = new Uint8Array(await f.arrayBuffer());
  if (kind.image && !looksLike(kind.type, buf)) return bad("사진 파일이 아니거나 손상된 파일이에요.");
  const s = await getStore();
  const now = new Date().toISOString();
  const row = await s.insert("PostFiles", { postId: p.id, name, type: kind.type, size: String(buf.length), data: Buffer.from(buf).toString("base64"), createdAt: now });
  const meta: FileMeta = { id: row.id, name, type: kind.type, size: buf.length, image: kind.image };
  // 다른 요청이 그사이 바꿨을 수 있으니 최신 글을 다시 읽어 붙인다.
  const fresh = (await s.list("Posts")).find((x) => x.id === p.id);
  await s.update("Posts", p.id, { files: JSON.stringify([...readFiles(fresh ?? p), meta]) });
  return NextResponse.json({ file: meta });
}
