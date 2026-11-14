import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { avatarView } from "@/lib/avatar";
import { readGenderEdit } from "@/lib/gender-edit";
import { memberClubs } from "@/lib/lists";
import { fieldValues, readFields, withFields } from "@/lib/member-fields";
import { checkPermChange, effectivePerms, getPermGroups, groupKeysOf, isAllNow, isPermsCustom } from "@/lib/perms";
import { clubsJson, memberBody } from "@/lib/schemas";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 회원 명단(회사·연락처·생년월일 포함)은 관리자에게만 내려준다.
//  perms: 개인 권한, effective: 최종 권한(그룹 ∪ 개인), groups: 속한 그룹 키, clubs: [{name, role}]
export async function GET() {
  const g = await guard("members");
  if ("err" in g) return g.err;
  const s = await getStore();
  const groups = await getPermGroups();
  const members = (await s.list("Members")).map(({ extra: _extra, prefs: _prefs, ...m }) => (void _prefs, {
    ...m,
    avatar: avatarView(m),
    perms: m.perms ? m.perms.split("|").filter(Boolean) : [],
    clubs: memberClubs(m),
    effective: effectivePerms({ ...m, extra: _extra }, groups),
    groups: groupKeysOf(m),
    permsCustom: isPermsCustom({ extra: _extra }),
    fields: readFields({ extra: _extra }),
    genderEdit: readGenderEdit(_extra), // 회원이 직접 성별을 바꾼 기록(관리자가 확인하면 사라짐)
  }));
  return NextResponse.json({ members });
}

const body = memberBody.extend({ fields: fieldValues });

export async function POST(req: Request) {
  const g = await guard("members");
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("이름을 입력해 주세요.");
  const { fields, perms, clubs, ...d } = parsed.data;

  const s = await getStore();
  const all = await s.list("Members");
  const row = { ...d, perms: (perms ?? []).join("|"), clubs: clubsJson(clubs ?? []), extra: fields ? withFields("", fields) : "" };
  // 새 회원의 직책·소모임 직책 때문에 권한이 생기면 "모든 권한" 관리자만 추가할 수 있다.
  const groups = await getPermGroups();
  const err = checkPermChange(all, groups, [...all, { ...row, id: "__new__" }], groups, await isAllNow(g.s.mid));
  if (err) return bad(err[0], err[1]);
  const no = String(all.reduce((n, m) => Math.max(n, Number(m.no) || 0), 0) + 1);
  const saved = await s.insert("Members", { ...row, no });
  return NextResponse.json({ member: saved });
}
