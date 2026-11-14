import { parseJson } from "./api";
import { getSetting } from "./store";

// 관리자 "회원 구분" 화면에서 정하는 목록들. 모두 Settings 에 저장한다.
//  memberKinds: [{value, definition}] (예전부터 있던 값)
//  positions:   ["회장", "부회장", …, "일반회원"]   — 모임의 직책
//  clubs:       ["골프", "등산", …]                 — 소모임 이름
//  clubRoles:   ["회장", …]                         — 소모임 직책
export type Lists = {
  memberKinds: { value: string; definition: string }[];
  positions: string[];
  clubs: string[];
  clubRoles: string[];
};

export const DEFAULT_POSITIONS = ["회장", "부회장", "사무총장", "고문", "일반회원"];
export const DEFAULT_CLUB_ROLES = ["회장"];

export async function getLists(): Promise<Lists> {
  const [memberKinds, positions, clubs, clubRoles] = await Promise.all([
    getSetting("memberKinds", [] as Lists["memberKinds"]),
    getSetting("positions", DEFAULT_POSITIONS),
    getSetting("clubs", [] as string[]),
    getSetting("clubRoles", DEFAULT_CLUB_ROLES),
  ]);
  return { memberKinds, positions, clubs, clubRoles };
}

// 회원의 소모임: [{name, role}]. role 이 비어 있으면 일반 소모임 회원.
export type ClubSeat = { name: string; role: string };
export function memberClubs(m: { clubs?: string }): ClubSeat[] {
  return parseJson<ClubSeat[]>(m.clubs, [])
    .filter((c) => c && typeof c.name === "string" && c.name.trim())
    .map((c) => ({ name: c.name.trim(), role: typeof c.role === "string" ? c.role.trim() : "" }));
}

// 화면 표시용: "골프(회장), 등산"
export function clubsLabel(m: { clubs?: string }): string {
  return memberClubs(m).map((c) => (c.role ? `${c.name}(${c.role})` : c.name)).join(", ");
}
