import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { fieldValues, withFields } from "@/lib/member-fields";
import { memberBody } from "@/lib/schemas";
import { getStore } from "@/lib/store";

// 붙여넣은 명단을 한 번에 추가한다. 관리자 권한은 여기서 줄 수 없고, 이미 있는 이름은 건너뛴다.
const body = z.object({ rows: z.array(memberBody.omit({ perms: true }).extend({ fields: fieldValues })).min(1).max(300) });

export async function POST(req: Request) {
  const g = await guard("members");
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("명단을 확인해 주세요. 한 번에 300명까지, 성명은 꼭 있어야 해요.");

  const s = await getStore();
  const all = await s.list("Members");
  const names = new Set(all.map((m) => m.name.trim()));
  let no = all.reduce((n, m) => Math.max(n, Number(m.no) || 0), 0);

  const added: string[] = [];
  const skipped: string[] = [];
  for (const { fields, ...r } of parsed.data.rows) {
    const name = r.name.trim();
    if (names.has(name)) {
      skipped.push(name);
      continue;
    }
    names.add(name);
    no += 1;
    await s.insert("Members", { ...r, name, no: String(no), perms: "", extra: fields && Object.keys(fields).length ? withFields("", fields) : "" });
    added.push(name);
  }
  return NextResponse.json({ added: added.length, skipped });
}
