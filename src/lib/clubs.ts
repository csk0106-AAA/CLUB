import { z } from "zod";
import { memberClubs } from "./lists";
import { getSetting, setSetting } from "./store";

// 소모임 기본 정보. Settings "clubInfo" = { [소모임 이름]: ClubInfo }
//  intro: 소개, cycle: 모임 주기, place: 장소, bank/account/holder: 입금계좌,
//  feeAmount: 소모임 회비(숫자 문자열, 선택), feeText: 회비 안내, policy: 운영 정책(여러 줄)
// 소모임 회원과 직책은 Members.clubs([{name, role}])에 있다. role 이 있으면 그 소모임의 회장(직책자).
export const clubInfoInput = z.object({
  intro: z.string().trim().max(1000).default(""),
  cycle: z.string().trim().max(100).default(""),
  place: z.string().trim().max(120).default(""),
  bank: z.string().trim().max(40).default(""),
  account: z.string().trim().max(80).default(""),
  holder: z.string().trim().max(60).default(""),
  feeAmount: z.string().regex(/^\d{0,9}$/).default(""),
  feeText: z.string().trim().max(200).default(""),
  policy: z.string().trim().max(3000).default(""),
});
export type ClubInfo = z.infer<typeof clubInfoInput>;
export const EMPTY_CLUB: ClubInfo = { intro: "", cycle: "", place: "", bank: "", account: "", holder: "", feeAmount: "", feeText: "", policy: "" };

export async function readAllClubInfo(): Promise<Record<string, ClubInfo>> {
  const raw = await getSetting<Record<string, unknown>>("clubInfo", {});
  const out: Record<string, ClubInfo> = {};
  for (const [k, v] of Object.entries(raw && typeof raw === "object" ? raw : {})) {
    const r = clubInfoInput.safeParse(v ?? {});
    out[k] = r.success ? r.data : EMPTY_CLUB;
  }
  return out;
}

export async function readClubInfo(name: string): Promise<ClubInfo> {
  return (await readAllClubInfo())[name] ?? EMPTY_CLUB;
}

export async function writeClubInfo(name: string, info: ClubInfo): Promise<void> {
  const raw = await getSetting<Record<string, unknown>>("clubInfo", {});
  await setSetting("clubInfo", { ...raw, [name]: info });
}

// 주소의 [name] 조각 → 소모임 이름(이미 풀린 값이어도 안전하게)
export function clubParam(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

// 입금계좌 한 줄: "국민은행 123-45-6789"
export function clubAccount(i: ClubInfo): string {
  return [i.bank, i.account].map((x) => x.trim()).filter(Boolean).join(" ");
}

type M = { id?: string; name?: string; clubs?: string };

// 이 소모임 회원과 소모임 직책
export function clubMembers<T extends M>(members: T[], club: string): (T & { role: string })[] {
  return members.flatMap((m) => {
    const seat = memberClubs(m).find((c) => c.name === club);
    return seat ? [{ ...m, role: seat.role }] : [];
  });
}

// 이 소모임의 직책자(회장 등): role 이 있는 회원
export function clubLeaders<T extends M>(members: T[], club: string): { id: string; name: string; role: string }[] {
  return clubMembers(members, club).filter((m) => m.role).map((m) => ({ id: m.id ?? "", name: m.name ?? "", role: m.role }));
}

export function isClubLeader(m: { clubs?: string } | undefined, club: string): boolean {
  return !!m && !!club && memberClubs(m).some((c) => c.name === club && c.role);
}
