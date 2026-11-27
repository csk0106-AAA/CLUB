import { NextResponse } from "next/server";
import { parseJson } from "./api";
import { getSetting, getStore } from "./store";

// 개인정보 동의 여부: 회원 extra.consentAt 이 다시 동의 기준 시각(Settings "consentSince", 비어 있으면 동의만 하면 된다) 뒤면 동의.
//  기준 시각 전의 동의는 기록으로 남기되, 다음 접속 때 동의 안내를 다시 띄운다.
export const CONSENT_SINCE = "consentSince";
export const consentSince = () => getSetting<string>(CONSENT_SINCE, "");
export function consentOk(extra: { consentAt?: string } | undefined, since: string): boolean {
  const at = extra?.consentAt ?? "";
  return !!at && (!since || at >= since);
}
export async function hasConsent(memberId: string): Promise<boolean> {
  const me = (await (await getStore()).list("Members")).find((m) => m.id === memberId);
  return !!me && consentOk(parseJson<{ consentAt?: string }>(me.extra, {}), await consentSince());
}

// 동의하지 않은 회원은 다른 회원의 프로필 북을 볼 수 없다. 화면은 needConsent 로 동의 팝업을 띄운다.
export const consentRequired = () =>
  NextResponse.json(
    { error: "개인정보 안내에 동의해야 다른 회원의 프로필 북을 볼 수 있어요.", needConsent: true },
    { status: 403 },
  );
