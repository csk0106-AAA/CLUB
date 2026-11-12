import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { MEMBER_FIELDS_KEY } from "@/lib/member-fields";
import { getSetting, setSetting } from "@/lib/store";

export const dynamic = "force-dynamic";

// 회원 명단 추가 항목(열) 이름 목록
export async function GET() {
  const g = await guard("members");
  if ("err" in g) return g.err;
  return NextResponse.json({ fields: await getSetting<string[]>(MEMBER_FIELDS_KEY, []) });
}

const BUILTIN = ["성명", "이름", "회원구분", "구분", "직책", "성별", "회사명", "직위", "생년월일", "연락처", "연령대", "권한", "NO"];
const body = z.object({ fields: z.array(z.string().trim().min(1).max(20)).max(20) });

export async function PUT(req: Request) {
  const g = await guard("members");
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("항목 이름은 20자까지, 20개까지 만들 수 있어요.");
  const list = parsed.data.fields;
  if (new Set(list).size !== list.length) return bad("같은 이름의 항목이 있어요.");
  const clash = list.find((f) => BUILTIN.includes(f.replace(/\s/g, "")));
  if (clash) return bad(`“${clash}”은 기본 항목이라 추가할 수 없어요.`);
  await setSetting(MEMBER_FIELDS_KEY, list);
  return NextResponse.json({ fields: list });
}
