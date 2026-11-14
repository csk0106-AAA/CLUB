import { NextResponse } from "next/server";
import { bad } from "@/lib/api";
import { getStore } from "@/lib/store";
import { canEdit, canSee, findPost, forbid, getFileRow, getMe, readFiles } from "../../_lib/server";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ fid: string }> };

const ascii = (name: string) => name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\;]/g, "_") || "file";

// 첨부 내려받기: 그 글을 볼 수 있는 회원만. 사진은 화면에 바로, 그 밖에는 내려받기로.
export async function GET(_req: Request, ctx: Ctx) {
  const m = await getMe();
  if ("err" in m) return m.err;
  const fid = (await ctx.params).fid;
  const f = await getFileRow(fid);
  if (!f) return bad("파일을 찾을 수 없어요.", 404);
  const p = await findPost(f.postId);
  if (!p || !canSee(m.me, p) || !readFiles(p).some((x) => x.id === fid)) return bad("파일을 찾을 수 없어요.", 404);
  const meta = readFiles(p).find((x) => x.id === fid)!;
  const body = Buffer.from(f.data, "base64");
  const disp = meta.image ? "inline" : "attachment";
  return new NextResponse(body, {
    headers: {
      "Content-Type": meta.type || "application/octet-stream",
      "Content-Length": String(body.length),
      "Content-Disposition": `${disp}; filename="${ascii(meta.name)}"; filename*=UTF-8''${encodeURIComponent(meta.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

// 첨부 지우기: 글을 고칠 수 있는 사람만
export async function DELETE(_req: Request, ctx: Ctx) {
  const m = await getMe();
  if ("err" in m) return m.err;
  const fid = (await ctx.params).fid;
  const s = await getStore();
  const p = (await s.list("Posts")).find((x) => readFiles(x).some((f) => f.id === fid));
  if (!p || !canSee(m.me, p)) return bad("파일을 찾을 수 없어요.", 404);
  if (!canEdit(m.me, p)) return forbid("작성자나 관리자만 파일을 지울 수 있어요.");
  await s.remove("PostFiles", fid);
  await s.update("Posts", p.id, { files: JSON.stringify(readFiles(p).filter((f) => f.id !== fid)) });
  return NextResponse.json({ ok: true });
}
