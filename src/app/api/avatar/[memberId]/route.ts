import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { getPhotoRow, readAvatar } from "@/lib/avatar";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 회원 프로필 사진 보기: 로그인한 회원만. 사진이 없으면 404(화면은 캐릭터·첫 글자로 대신 보여 준다).
export async function GET(_req: Request, ctx: { params: Promise<{ memberId: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { memberId } = await ctx.params;
  const m = (await (await getStore()).list("Members")).find((x) => x.id === memberId);
  const a = m ? readAvatar(m.avatar) : null;
  if (!m || a?.type !== "photo") return bad("사진이 없어요.", 404);
  const f = await getPhotoRow(a.fileId);
  if (!f || f.memberId !== m.id || !f.data) return bad("사진이 없어요.", 404);
  const body = Buffer.from(f.data, "base64");
  return new NextResponse(body, {
    headers: {
      "Content-Type": f.type || "application/octet-stream",
      "Content-Length": String(body.length),
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Cache-Control": "private, max-age=300",
    },
  });
}
