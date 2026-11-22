import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { clearPin } from "@/lib/pin";
import { tellMember } from "@/lib/pin-alerts";
import { getStore } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };
const body = z.object({ kind: z.enum(["member", "admin"]) });

// PIN 초기화: 회원 PIN 은 회원관리 권한, 관리자용 PIN 은 모든 권한. 관리자도 PIN 을 볼 수는 없고 지우기만 한다.
//  회원 PIN 을 지우면 그 회원은 다시 연락처 뒷자리 4자리로 로그인해 새 PIN 을 만든다.
//  관리자용 PIN 을 지우면 다시 공용 관리자 비밀번호를 거쳐 새 관리자용 PIN 을 만든다.
export async function POST(req: Request, ctx: Ctx) {
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad("요청을 확인해 주세요.");
  const g = await guard(p.data.kind === "admin" ? "all" : ["members", "all"]);
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const m = await (await getStore()).get("Members", id);
  if (!m) return bad("회원을 찾을 수 없어요.", 404);
  await clearPin(id, p.data.kind);
  await tellMember(id, p.data.kind === "member"
    ? "관리자가 로그인 PIN 을 초기화했어요. 다음 로그인 때 연락처 뒷자리 4자리로 들어와 새 PIN 을 만들어 주세요."
    : "관리자가 관리자용 PIN 을 초기화했어요. 관리자 화면에 들어갈 때 공용 관리자 비밀번호를 거쳐 새 PIN 을 만들어 주세요.").catch(() => undefined);
  return NextResponse.json({ ok: true });
}
