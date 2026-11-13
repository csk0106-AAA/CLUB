import { NextResponse } from "next/server";
import { parseJson } from "./api";
import { getStore } from "./store";

// 개인정보 동의 여부(회원 extra.consentAt 이 있으면 동의)
export async function hasConsent(memberId: string): Promise<boolean> {
  const me = (await (await getStore()).list("Members")).find((m) => m.id === memberId);
  return Boolean(me && parseJson<{ consentAt?: string }>(me.extra, {}).consentAt);
}

// 동의하지 않은 회원은 다른 회원의 프로필 북을 볼 수 없다. 화면은 needConsent 로 동의 팝업을 띄운다.
export const consentRequired = () =>
  NextResponse.json(
    { error: "개인정보 안내에 동의해야 다른 회원의 프로필 북을 볼 수 있어요.", needConsent: true },
    { status: 403 },
  );
