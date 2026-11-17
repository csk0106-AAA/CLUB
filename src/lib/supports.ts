import { z } from "zod";

// 일정 지원금(일정관리 › 회비). 총 예산 = 참석자 회비 합계 + 지원금 합계.
//  dues: 모임(또는 소모임)의 연·월회비에서 지원 / member: 회원이 지원금을 냄(지원한 회원 이름)
export type SupportKind = "dues" | "member";
export type Support = { kind: SupportKind; name: string; amount: string; memo: string };
export const SUPPORT_LABEL: Record<SupportKind, string> = { dues: "모임회비 지원", member: "회원 지원" };

export const supportsInput = z.array(z.object({
  kind: z.enum(["dues", "member"]),
  name: z.string().trim().max(60).default(""),
  amount: z.string().regex(/^\d{1,10}$/, "지원금 금액을 숫자로 넣어 주세요."),
  memo: z.string().trim().max(200).default(""),
})).max(50);

export function readSupports(text: string | undefined): Support[] {
  try {
    const v = JSON.parse(text || "[]");
    const r = supportsInput.safeParse(v);
    return r.success ? r.data : [];
  } catch {
    return [];
  }
}

export const supportTotal = (list: { amount: string }[]) => list.reduce((n, s) => n + (Number(s.amount) || 0), 0);
