import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { getSetting, getStore, setSetting } from "@/lib/store";

export const dynamic = "force-dynamic";

const body = z.object({
  clubName: z.string().trim().min(1).max(80),
  clubShortName: z.string().trim().max(40).default(""),
  inviteCode: z.string().trim().min(4).max(32),
  memberKinds: z
    .array(z.object({
      value: z.string().trim().min(1).max(30),
      definition: z.string().max(300).default(""),
      from: z.string().max(30).optional(), // 화면에서 불러올 때의 이름. 다르면 이름을 바꾼 것으로 보고 명단에도 반영한다.
    }))
    .min(1)
    .max(20),
});

// 원우회 이름, 초대코드, 회원구분 값과 정의. 모두 관리자가 바꿀 수 있다.
export async function GET() {
  const g = await guard("members");
  if ("err" in g) return g.err;
  return NextResponse.json({
    clubName: await getSetting("clubName", ""),
    clubShortName: await getSetting("clubShortName", ""),
    inviteCode: await getSetting("inviteCode", ""),
    memberKinds: await getSetting("memberKinds", []),
  });
}

export async function PUT(req: Request) {
  const g = await guard("members");
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요. 초대코드는 4자 이상이에요.");
  const d = parsed.data;
  await setSetting("clubName", d.clubName);
  await setSetting("clubShortName", d.clubShortName);
  await setSetting("inviteCode", d.inviteCode);
  const values = d.memberKinds.map((k) => k.value);
  if (new Set(values).size !== values.length) return bad("같은 회원구분 이름이 두 번 들어 있어요.");
  await setSetting("memberKinds", d.memberKinds.map(({ value, definition }) => ({ value, definition })));

  // 이름을 바꾼 구분은 회원 명단에도 그대로 반영한다(예: 준회원 → 특별회원).
  const renames = d.memberKinds.filter((k) => k.from && k.from !== k.value).map((k) => ({ from: k.from as string, to: k.value }));
  let moved = 0;
  if (renames.length) {
    const s = await getStore();
    for (const m of await s.list("Members")) {
      const r = renames.find((x) => x.from === m.kind);
      if (r) {
        await s.update("Members", m.id, { kind: r.to });
        moved++;
      }
    }
  }
  return NextResponse.json({ ok: true, moved });
}
