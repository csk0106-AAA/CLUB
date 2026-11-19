import type { NextResponse } from "next/server";
import { adminOrOfficer, bad, guard, guardEv } from "./api";
import { clubParam } from "./clubs";
import type { CoverScope } from "./covers";
import { getLists } from "./lists";
import { getStore } from "./store";

// 대표사진을 관리할 수 있는지(api/admin/covers, api/admin/covers/photos 가 함께 쓴다)
//  모임(scope=org): 모임설정 권한(group)
//  클럽(scope=club&name=): 회원정보 권한 관리자 또는 그 클럽 직책자(클럽관리 › 개요와 같은 기준)
//  일정(scope=event&name=일정 id): 그 일정 관리 화면을 쓸 수 있는 사람
export async function coverAccess(scope: string | null, name: string | null): Promise<{ err: NextResponse } | { c: CoverScope }> {
  // 일정(scope=event&name=일정 id): 그 일정 관리 화면을 쓸 수 있는 사람(일정관리 권한·만든 사람·편집자·클럽관리)
  if (scope === "event" && name) {
    const g = await guardEv({ params: Promise.resolve({ id: name }) }, "events");
    if ("err" in g) return g;
    if (!(await (await getStore()).get("Events", name))) return { err: bad("일정을 찾을 수 없어요.", 404) };
    return { c: { scope: "event", id: name } };
  }
  if (scope === "org") {
    const g = await guard("group");
    return "err" in g ? g : { c: { scope: "org" } };
  }
  if (scope === "club" && name) {
    const g = await adminOrOfficer("members");
    if ("err" in g) return g;
    const club = clubParam(name);
    if (!(await getLists()).clubs.includes(club)) return { err: bad("클럽을 찾을 수 없어요.", 404) };
    if (!g.adminOk && !g.officerOf.includes(club)) return { err: bad("내가 직책을 맡은 클럽만 관리할 수 있어요.", 403) };
    return { c: { scope: "club", name: club } };
  }
  return { err: bad("대표사진 종류를 확인해 주세요.") };
}
