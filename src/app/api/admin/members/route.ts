import { NextResponse } from "next/server";
import { MAX_ADMINS, bad, guard } from "@/lib/api";
import { can } from "@/lib/auth";
import { fieldValues, readFields, withFields } from "@/lib/member-fields";
import { memberBody } from "@/lib/schemas";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 회원 명단(회사·연락처·생년월일 포함)은 관리자에게만 내려준다.
export async function GET() {
  const g = await guard("members");
  if ("err" in g) return g.err;
  const s = await getStore();
  const members = (await s.list("Members")).map(({ extra: _extra, ...m }) => ({
    ...m,
    perms: m.perms ? m.perms.split("|").filter(Boolean) : [],
    fields: readFields({ extra: _extra }),
  }));
  return NextResponse.json({ members });
}

const body = memberBody.extend({ fields: fieldValues });

export async function POST(req: Request) {
  const g = await guard("members");
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("이름을 입력해 주세요.");
  const { fields, ...d } = parsed.data;

  // 관리자 권한을 주는 일은 '모든 권한' 관리자만 할 수 있고, 최대 5명까지다.
  const s = await getStore();
  const all = await s.list("Members");
  if (d.perms.length > 0) {
    if (!can(g.s, "all")) return bad("관리자 권한은 모든 권한 관리자만 줄 수 있어요.", 403);
    if (all.filter((m) => m.perms).length >= MAX_ADMINS) return bad(`관리자는 최대 ${MAX_ADMINS}명까지예요.`);
  }
  const no = String(all.reduce((n, m) => Math.max(n, Number(m.no) || 0), 0) + 1);
  const row = await s.insert("Members", { ...d, no, perms: d.perms.join("|"), extra: fields ? withFields("", fields) : "" });
  return NextResponse.json({ member: row });
}
