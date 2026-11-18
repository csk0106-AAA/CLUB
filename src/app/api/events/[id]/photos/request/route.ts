import { NextResponse } from "next/server";
import { bad } from "@/lib/api";
import { photoAccess } from "@/lib/event-photos";
import { addPhotoRequest, photoManagers } from "@/lib/photo-requests";
import { pushTo } from "@/lib/push";

export const dynamic = "force-dynamic";

// 사진첩 장수 늘리기 요청: 사진을 올릴 수 있는 회원이 "관리자 요청"을 누르면
// 이 일정을 관리하는 관리자에게 알림(휴대폰)을 보내고, 처리할 일에 올린다(lib/photo-requests.ts).
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await photoAccess(ctx);
  if ("err" in a) return a.err;
  if (!a.canUpload) return bad("참석 신청한 회원만 요청할 수 있어요.", 403);
  const added = await addPhotoRequest(a.e, a.s.mid);
  if (added) await pushTo(await photoManagers(a.e), "alerts", a.s.mid).catch(() => 0);
  return NextResponse.json({ ok: true, already: !added });
}
