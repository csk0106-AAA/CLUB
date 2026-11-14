import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { AVATAR_KEYS, avatarView, removeMemberPhotos } from "@/lib/avatar";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const body = z.object({ type: z.literal("character"), key: z.enum(AVATAR_KEYS) }).strict();

// 프로필 사진을 캐릭터로: {type:"character", key}. 올려 둔 사진이 있으면 지운다.
export async function PUT(req: Request) {
  const g = await guard();
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("고를 수 있는 캐릭터가 아니에요.");
  const s = await getStore();
  const avatar = JSON.stringify({ type: "character", key: parsed.data.key });
  const row = await s.update("Members", g.s.mid, { avatar });
  if (!row) return bad("회원 정보를 찾을 수 없어요.", 404);
  await removeMemberPhotos(g.s.mid);
  return NextResponse.json({ avatar: avatarView({ id: g.s.mid, avatar }) });
}

// 기본으로 되돌리기: 고른 캐릭터·올린 사진을 모두 지운다.
export async function DELETE() {
  const g = await guard();
  if ("err" in g) return g.err;
  const s = await getStore();
  const row = await s.update("Members", g.s.mid, { avatar: "" });
  if (!row) return bad("회원 정보를 찾을 수 없어요.", 404);
  await removeMemberPhotos(g.s.mid);
  return NextResponse.json({ avatar: null });
}
