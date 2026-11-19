import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { coverId, type CoverScope } from "@/lib/covers";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 대표사진 보기(로그인한 회원): ?scope=org | ?scope=club&name=클럽 이름 | ?scope=event&id=일정 id, ?size=thumb 이면 미리보기(400px)
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  // 모임 대표사진은 로그인 화면에도 보이므로 로그인 없이 볼 수 있다. 클럽·일정 대표사진은 로그인한 회원만.
  if (q.get("scope") !== "org") {
    const g = await guard();
    if ("err" in g) return g.err;
  }
  const scope: CoverScope | null = q.get("scope") === "org" ? { scope: "org" } : q.get("scope") === "club" && q.get("name") ? { scope: "club", name: q.get("name") ?? "" } : q.get("scope") === "event" && q.get("id") ? { scope: "event", id: q.get("id") ?? "" } : null;
  if (!scope) return bad("대표사진을 찾을 수 없어요.", 404);
  const row = await (await getStore()).get("CoverData", coverId(scope));
  if (!row) return bad("대표사진이 없어요.", 404);
  const thumb = q.get("size") === "thumb";
  const body = Buffer.from((thumb ? row.thumb : row.data) ?? "", "base64");
  return new NextResponse(body, {
    headers: {
      "Content-Type": thumb ? "image/jpeg" : row.type || "image/jpeg",
      "Content-Length": String(body.length),
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      // 주소에 바뀐 시각(?v=)이 붙으므로 오래 캐시해도 된다
      "Cache-Control": q.get("scope") === "org" ? "public, max-age=86400" : "private, max-age=86400",
    },
  });
}
