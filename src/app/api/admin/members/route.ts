import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { avatarView } from "@/lib/avatar";
import { readGenderEdit } from "@/lib/gender-edit";
import { memberClubs } from "@/lib/lists";
import { appMark } from "@/lib/member-apps";
import { ageGroupOf, memberAgeGroup, tidyBirth } from "@/lib/age-group";
import { tidyPhone } from "@/lib/phone";
import { fieldValues, readFields, withFields } from "@/lib/member-fields";
import { uniqueName } from "@/lib/member-name";
import { sortByNo } from "@/lib/member-order";
import { ensureWithdrawnKind, timelineOf } from "@/lib/member-history";
import { approvedAtOf, isGuest, isWithdrawn } from "@/lib/member-kind";
import { checkPermChange, effectivePerms, getPermGroups, groupKeysOf, isAllNow, isPermsCustom, ownPerms } from "@/lib/perms";
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
  const apps = await s.list("MemberApps");
  const all = await s.list("Members");
  const nameOf = (id: string) => all.find((x) => x.id === id)?.name ?? "";
  // 탈퇴회원이 있으면 회원구분 목록에 "탈퇴회원"을 더해 둔다(필터·회원구분 화면에 보이게)
  if (all.some((m) => isWithdrawn(m.kind))) await ensureWithdrawnKind();
  // 관리자가 끌어서 정한 순서(NO)대로
  const members = sortByNo(all).map(({ extra: _extra, prefs: _prefs, ...m }) => (void _prefs, {
    ...m,
    avatar: avatarView(m),
    perms: ownPerms(m), // 개인 권한(예전 권한 이름은 지금 이름으로)
    clubs: memberClubs(m),
    effective: effectivePerms({ ...m, extra: _extra }, groups),
    groups: groupKeysOf(m),
    permsCustom: isPermsCustom({ extra: _extra }),
    fields: readFields({ extra: _extra }),
    genderEdit: readGenderEdit(_extra), // 회원이 직접 성별을 바꾼 기록(관리자가 확인하면 사라짐)
    edu: m.edu === "true", // 교육 이수
    birth: tidyBirth(m.birth), // 예전에 700101·1970.1.1 처럼 넣은 생년월일도 1970-01-01 로 보여 준다
    ageGroup: memberAgeGroup(m), // 생년월일이 있으면 생년월일로 계산
    app: appMark(apps, m.id), // 회원 신청 "승인 전" / "반려"(사유)
    approvedAt: approvedAtOf(m), // 관리자가 회원 승인한 마지막 시각(직접 넣은 회원은 넣은 시각). 예전 회원은 ""
    history: timelineOf({ ...m, extra: _extra ?? "" }, apps, nameOf), // 가입·탈퇴 이력(회원 수정 화면)
  }));
  return NextResponse.json({ members });
}

const body = memberBody.extend({ fields: fieldValues });

export async function POST(req: Request) {
  const g = await guard("members");
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("이름을 입력해 주세요.");
  const { fields, perms, clubs, edu, bookShown, ...d } = parsed.data;

  const s = await getStore();
  const all = await s.list("Members");
  // 같은 이름이 있으면 뒤에 알파벳을 붙여 저장하고(김하늘 → 김하늘B) 화면에 알린다
  const name = uniqueName(d.name, all.map((m) => m.name ?? ""));
  const row = { ...d, birth: tidyBirth(d.birth), phone: tidyPhone(d.phone), ageGroup: ageGroupOf(d.birth) || d.ageGroup, memo: d.memo ?? "", edu: edu ? "true" : "", bookHidden: bookShown === false ? "true" : "", name, perms: (perms ?? []).join("|"), clubs: clubsJson(clubs ?? []), extra: fields ? withFields("", fields) : "" };
  // 새 회원의 직책·클럽 직책 때문에 권한이 생기면 "모든 권한" 관리자만 추가할 수 있다.
  const groups = await getPermGroups();
  const err = checkPermChange(all, groups, [...all, { ...row, id: "__new__" }], groups, await isAllNow(g.s.mid));
  if (err) return bad(err[0], err[1]);
  const no = String(all.reduce((n, m) => Math.max(n, Number(m.no) || 0), 0) + 1);
  const at = new Date().toISOString();
  const saved = await s.insert("Members", { ...row, no, joinedAt: at, ...(isGuest(row.kind) ? {} : { memberSince: at }) });
  return NextResponse.json({ member: saved, ...(name !== d.name.trim() ? { renamed: { from: d.name.trim(), to: name } } : {}) });
}
