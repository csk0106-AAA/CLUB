import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { fieldValues, withFields } from "@/lib/member-fields";
import { uniqueName } from "@/lib/member-name";
import { ageGroupOf, tidyBirth } from "@/lib/age-group";
import { phoneKey, tidyPhone } from "@/lib/phone";
import { checkPermChange, getPermGroups, isAllNow } from "@/lib/perms";
import { memberBody } from "@/lib/schemas";
import { getStore } from "@/lib/store";

// 붙여넣은 명단을 한 번에 추가한다. 관리자 권한·클럽은 여기서 줄 수 없고, 이미 있는 회원은 건너뛴다(기존 회원은 건드리지 않는다).
// 같은 이름이지만 연락처가 다른 동명이인은 이름 뒤에 알파벳을 붙여 넣는다(renamed 로 알려 준다).
// dup: 이름은 같고 연락처가 다른 회원을 어떻게 할지(미리보기에서 관리자가 고른다)
//  skip: 같은 사람 — 넣지 않음 / update: 같은 사람 — 기존 회원 연락처를 새 번호로 고침 / new: 다른 사람 — 이름 뒤에 알파벳을 붙여 넣음
const body = z.object({
  rows: z.array(memberBody.omit({ perms: true, clubs: true }).extend({ fields: fieldValues, dup: z.enum(["skip", "update", "new"]).optional() })).min(1).max(300),
});

export async function POST(req: Request) {
  const g = await guard("members");
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("명단을 확인해 주세요. 한 번에 300명까지, 성명은 꼭 있어야 해요.");

  const s = await getStore();
  const all = await s.list("Members");
  // 이미 있는 회원(이름 + 연락처 숫자가 같거나, 이름이 같고 어느 한쪽 연락처가 비어 있음)은 같은 사람으로 보고 건너뛴다.
  // 이름만 같고 연락처가 다르면 동명이인: 이름 뒤에 알파벳을 붙여 넣는다(김하늘 → 김하늘B).
  const digits = phoneKey; // +82 번호도 010 으로 맞춰 비교
  const known = all.map((m) => ({ id: m.id, name: (m.name ?? "").trim(), phone: digits(m.phone) }));
  const taken = new Set(known.map((k) => k.name));
  let no = all.reduce((n, m) => Math.max(n, Number(m.no) || 0), 0);

  const rows: Record<string, string>[] = [];
  const skipped: string[] = [];
  const renamed: { from: string; to: string }[] = [];
  const updated: string[] = [];
  const phoneFix: { id: string; phone: string }[] = [];
  for (const { fields, edu, memo, dup, bookShown: _bs, ...r } of parsed.data.rows) {
    void _bs; // 프로필 북 노출은 명단 넣기에서 정하지 않는다(기본: 보임)
    const asked = r.name.trim();
    const phone = digits(r.phone);
    if (known.some((k) => k.name === asked && (!phone || !k.phone || k.phone === phone))) {
      skipped.push(asked);
      continue;
    }
    // 이름만 같고 연락처가 다름: 관리자가 고른 대로(고르지 않았으면 예전처럼 동명이인으로 넣는다)
    const same = known.find((k) => k.id && k.name === asked);
    if (same && dup === "skip") {
      skipped.push(asked);
      continue;
    }
    if (same?.id && dup === "update") {
      phoneFix.push({ id: same.id, phone: tidyPhone(r.phone) });
      same.phone = phone;
      updated.push(asked);
      continue;
    }
    const name = uniqueName(asked, taken);
    if (name !== asked) renamed.push({ from: asked, to: name });
    taken.add(name);
    known.push({ id: "", name: asked, phone });
    no += 1;
    rows.push({ ...r, birth: tidyBirth(r.birth), phone: tidyPhone(r.phone), ageGroup: ageGroupOf(r.birth) || r.ageGroup, name, edu: edu ? "true" : "", memo: memo ?? "", no: String(no), perms: "", clubs: "", extra: fields && Object.keys(fields).length ? withFields("", fields) : "" });
  }
  // 직책 그룹 권한 때문에 새 회원에게 권한이 생기면 "모든 권한" 관리자만 넣을 수 있다.
  const groups = await getPermGroups();
  const err = checkPermChange(all, groups, [...all, ...rows.map((r, i) => ({ ...r, id: `__new${i}` }))], groups, await isAllNow(g.s.mid));
  if (err) return bad(`${err[0]} (권한이 있는 직책의 회원이 들어 있어요)`, err[1]);
  for (const r of rows) await s.insert("Members", r);
  for (const f of phoneFix) await s.update("Members", f.id, { phone: f.phone });
  return NextResponse.json({ added: rows.length, skipped, renamed, updated });
}
