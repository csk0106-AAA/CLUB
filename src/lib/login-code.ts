import { getSetting } from "./store";

// 개인 초대코드 = 명단에 등록된 연락처 뒷자리 4자리. 연락처가 없는 회원만 공통 초대코드를 쓴다.
export async function loginCode(member: { phone?: string }): Promise<string> {
  const digits = (member.phone ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : String(await getSetting("inviteCode", process.env.INVITE_CODE ?? ""));
}
