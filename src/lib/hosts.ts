// 활동 진행자(사회자) 여러 명. EventActivities.hosts = [{memberId, code}] JSON.
// 예전에 한 명만 저장하던 hostId/hostCode 도 읽는다(hosts 가 비어 있으면 그 한 명).
export type Host = { memberId: string; code: string };

export function readHosts(act: { hosts?: string; hostId?: string; hostCode?: string } | undefined): Host[] {
  if (!act) return [];
  try {
    const v = JSON.parse(act.hosts || "null");
    if (Array.isArray(v)) {
      return v
        .filter((h) => h && typeof h.memberId === "string" && h.memberId)
        .map((h) => ({ memberId: String(h.memberId), code: String(h.code ?? "") }));
    }
  } catch {
    // 아래 예전 값으로
  }
  return act.hostId ? [{ memberId: act.hostId, code: act.hostCode ?? "" }] : [];
}

export const isHost = (act: Parameters<typeof readHosts>[0], mid: string) => readHosts(act).some((h) => h.memberId === mid);
// 이 회원이 이 번호로 진행자 로그인할 수 있는지
export const hostCodeMatches = (act: Parameters<typeof readHosts>[0], mid: string, code: string) =>
  readHosts(act).some((h) => h.memberId === mid && h.code && h.code === code.trim());
