import { parseJson } from "./api";
import { WITHDRAWN } from "./member-kind";
import { getSetting, setSetting } from "./store";
import type { Row } from "./store/types";

// 회원 가입·탈퇴 이력(관리자 › 회원 수정에서 본다). Members.extra 의 history 에 쌓는다.
//  what: 탈퇴 | 탈퇴 해지 | 재가입 신청 | 구분 변경 …, from/to: 회원구분, by: 처리한 관리자 이름(회원 본인이면 비움)
// 탈퇴할 때의 회원구분·프로필 북 노출은 extra.withdrawn 에 남겨 두었다가 "탈퇴 해지" 때 되돌린다.
export type HistoryItem = { at: string; what: string; from?: string; to?: string; by?: string; note?: string };
type Extra = { history?: HistoryItem[]; withdrawn?: { at: string; prevKind: string; prevBookHidden: string } } & Record<string, unknown>;

const readExtra = (extra?: string) => parseJson<Extra>(extra, {});

export function historyOf(m: { extra?: string }): HistoryItem[] {
  const h = readExtra(m.extra).history;
  return Array.isArray(h) ? h : [];
}

export function withHistory(extra: string | undefined, item: HistoryItem, patch?: Partial<Extra>): string {
  const cur = readExtra(extra);
  return JSON.stringify({ ...cur, ...patch, history: [...(Array.isArray(cur.history) ? cur.history : []), item].slice(-100) });
}

export function withdrawnInfo(m: { extra?: string }): { at: string; prevKind: string; prevBookHidden: string } | null {
  const w = readExtra(m.extra).withdrawn;
  return w && typeof w === "object" ? w : null;
}

// 탈퇴: 회원구분을 탈퇴회원으로, 프로필 북에서 바로 빼고, 되돌릴 값을 남긴다(다른 기록은 그대로 둔다)
export function withdrawPatch(m: Row, at: string): Record<string, string> {
  return {
    kind: WITHDRAWN,
    bookHidden: "true",
    extra: withHistory(m.extra, { at, what: "탈퇴", from: m.kind ?? "" }, { withdrawn: { at, prevKind: m.kind ?? "", prevBookHidden: m.bookHidden ?? "" } }),
  };
}

// 탈퇴 해지: 탈퇴 전 회원구분·프로필 북 노출로 되돌린다
export function restorePatch(m: Row, at: string, by: string, note = ""): Record<string, string> {
  const w = withdrawnInfo(m);
  const kind = w?.prevKind && w.prevKind !== WITHDRAWN ? w.prevKind : "대기회원";
  return {
    kind,
    bookHidden: w?.prevBookHidden ?? "",
    extra: withHistory(m.extra, { at, what: "탈퇴 해지", from: WITHDRAWN, to: kind, by, ...(note ? { note } : {}) }, { withdrawn: undefined }),
  };
}

// 회원 수정 화면의 가입·탈퇴 이력: 회원 신청(가입 신청·구분 변경 요청·재가입 신청과 처리 결과) + 탈퇴·탈퇴 해지 기록
const APP_LABEL: Record<string, string> = { member: "회원 신청", observe: "참관 신청", change: "구분 변경 요청", rejoin: "재가입 신청" };
const SRC_LABEL: Record<string, string> = { signup: "로그인 화면", settings: "설정", change: "설정 › 회원 권한 수정", rejoin: "로그인 화면" };
const DONE_LABEL: Record<string, string> = { approved: "승인", rejected: "반려", canceled: "취소" };
export function timelineOf(m: Row, apps: Row[], nameOf: (id: string) => string): HistoryItem[] {
  const out: HistoryItem[] = [];
  for (const a of apps.filter((x) => x.memberId === m.id)) {
    const label = APP_LABEL[a.type] ?? "신청";
    const to = a.type === "change" && a.toKind ? ` (${a.fromKind || "?"} → ${a.toKind})` : "";
    out.push({ at: a.createdAt ?? "", what: `${label}${to}`, note: SRC_LABEL[a.source] ?? "" });
    if (a.status !== "pending" && a.handledAt) {
      out.push({
        at: a.handledAt, what: `${label} ${DONE_LABEL[a.status] ?? a.status}`, by: a.handledBy ? nameOf(a.handledBy) : "",
        ...(a.status === "approved" && a.fromKind && a.toKind && a.fromKind !== a.toKind ? { from: a.fromKind, to: a.toKind } : {}),
        ...(a.status === "rejected" && a.reason ? { note: `사유: ${a.reason}` } : {}),
      });
    }
  }
  // 탈퇴·탈퇴 해지(재가입 신청·구분 변경은 위 신청 기록에 있다)
  for (const h of historyOf(m)) if (h.what === "탈퇴" || h.what === "탈퇴 해지" || h.what === "관리자 구분 변경") out.push(h);
  return out.filter((x) => x.at).sort((a, b) => a.at.localeCompare(b.at));
}

// 회원구분 목록(관리자 › 회원관리 › 회원구분)에 탈퇴회원이 없으면 더한다
export async function ensureWithdrawnKind(): Promise<void> {
  const kinds = await getSetting<{ value: string; definition?: string }[]>("memberKinds", []);
  if (!Array.isArray(kinds) || kinds.some((k) => k.value === WITHDRAWN)) return;
  await setSetting("memberKinds", [...kinds, { value: WITHDRAWN, definition: "회원이 설정에서 직접 탈퇴한 회원. 로그인할 수 없고 프로필 북에 나오지 않아요. 활동 기록은 남아 있고, 회원 수정에서 ‘탈퇴 해지’로 되돌릴 수 있어요." }]);
}

// 설정 › 회원 정보 오른쪽 끝: 회원 정보의 가장 최근 일(승인·반려·신청 대기·탈퇴·탈퇴 해지·구분 변경)과 날짜.
// 기록이 하나도 없으면 회원 승인일(예전 회원은 2026/11/18)로 "가입승인".
export type LatestStatus = { label: string; at: string; tone: "ok" | "warn" | "bad" };
const SHORT: Record<string, string> = { member: "가입", observe: "참관", change: "회원구분변경", rejoin: "재가입" };
export function latestStatus(m: Row, apps: Row[], fallbackAt: string): LatestStatus | null {
  type Ev = LatestStatus & { key: number };
  const evs: Ev[] = [];
  let k = 0;
  const kinds = (from?: string, to?: string) => (from && to && from !== to ? ` (${from}→${to})` : "");
  for (const a of apps.filter((x) => x.memberId === m.id)) {
    const name = SHORT[a.type] ?? "신청";
    if (a.status === "pending") evs.push({ key: k++, at: a.createdAt ?? "", tone: "warn", label: `${name} 신청 · 승인 대기` });
    else if (a.status === "approved") evs.push({ key: k++, at: a.handledAt || a.createdAt || "", tone: "ok", label: `${name === "가입" ? "가입승인" : `${name} 승인`}${a.type === "change" ? kinds(a.fromKind, a.toKind) : ""}` });
    else if (a.status === "rejected") evs.push({ key: k++, at: a.handledAt || a.createdAt || "", tone: "bad", label: `${name} 신청 반려` });
  }
  for (const h of historyOf(m)) {
    if (h.what === "탈퇴") evs.push({ key: k++, at: h.at, tone: "bad", label: "탈퇴" });
    else if (h.what === "탈퇴 해지") evs.push({ key: k++, at: h.at, tone: "ok", label: `탈퇴 해지${kinds(h.from, h.to)}` });
    else if (h.what === "관리자 구분 변경") evs.push({ key: k++, at: h.at, tone: "ok", label: `회원구분변경${kinds(h.from, h.to)}` });
  }
  const last = evs.filter((e) => e.at).sort((a, b) => a.at.localeCompare(b.at) || a.key - b.key).at(-1);
  if (last) return { label: last.label, at: last.at, tone: last.tone };
  return fallbackAt ? { label: "가입승인", at: fallbackAt, tone: "ok" } : null;
}
